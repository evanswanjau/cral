import { z } from "zod";
import { ApiError, PaginationQuerySchema } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { isUniqueViolation } from "../../lib/pg-errors.js";
import { notify } from "../../lib/notifications.js";
import { enqueueRenterNotificationDelivery } from "../../jobs/notification-delivery.js";
import { VEHICLE_CATEGORIES } from "../vehicles/categories.js";
import type { DocumentRow, MerchantRow } from "../merchant/db-types.js";
import type { UserRow } from "../auth/db-types.js";
import type { RequestContext } from "../merchant/service.js";
import { IMPORT_STATUSES, PHOTO_SLOTS, type PhotoSlot } from "../sale-listings/schemas.js";
import {
  PHOTO_LABELS,
  PUBLIC_STATUSES,
  askingPrice,
  conflict,
  deliverToSeller,
  disclosuresBlock,
  invalid,
  iso,
  notFound,
  notifySeller,
  saleDocuments,
  saleStorage,
  sellerDisplayName,
  title,
  type SaleDocs,
} from "../sale-listings/shared.js";
import type { SaleEnquiryRow, SaleListingReportRow, SaleListingRow } from "../sale-listings/db-types.js";

/**
 * Buying - openapi/sales-catalog.yaml. Browsing is public; enquiring and
 * reporting need a signed-in account with a verified phone.
 *
 * A buyer never sees the plate, the chassis number or the seller's phone:
 * the first two are what a cloned-logbook fraud needs, and the number is
 * the seller's to hand over (docs/plans/car-sales.md section 5).
 */

export const BrowseQuerySchema = PaginationQuerySchema.extend({
  q: z.string().trim().max(80).optional(),
  make: z.string().trim().max(60).optional(),
  category: z.enum(VEHICLE_CATEGORIES).optional(),
  county: z.string().trim().max(60).optional(),
  import_status: z.enum(IMPORT_STATUSES).optional(),
  min_price: z.coerce.number().int().min(0).optional(),
  max_price: z.coerce.number().int().min(0).optional(),
  min_year: z.coerce.number().int().optional(),
  max_year: z.coerce.number().int().optional(),
  max_mileage: z.coerce.number().int().min(0).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
});
export type BrowseQuery = z.infer<typeof BrowseQuerySchema>;

export const EnquirySchema = z.object({
  message: z.string().trim().min(5, "Write a short message to the seller.").max(2000),
  viewing_window: z.string().trim().max(120).optional(),
});

export const ReportSchema = z.object({
  reason: z.enum(["not_available", "wrong_details", "scam", "duplicate", "other"]),
  note: z.string().trim().max(2000).optional(),
});

/** Read on every listing and enquiry, verbatim (section 5 of the plan). */
export const SAFETY_NOTE = "Never pay anything before you have seen the car and the logbook in person.";

type PublicRow = SaleListingRow & {
  u_full_name: string | null;
  m_id: string | null;
};

function publicBase() {
  return db<SaleListingRow>("sale_listings as s")
    .join("users as u", "u.id", "s.seller_user_id")
    .leftJoin("merchants as m", "m.id", "s.merchant_id")
    .whereIn("s.status", PUBLIC_STATUSES);
}

function photoPath(ref: string, docId: string) {
  return `/sales/${ref}/photos/${docId}`;
}

function photosOf(row: SaleListingRow, docs: SaleDocs) {
  return PHOTO_SLOTS.filter((s) => docs.photos[s]).map((slot) => ({
    slot,
    label: PHOTO_LABELS[slot as PhotoSlot],
    url: photoPath(row.ref!, docs.photos[slot]!.id),
  }));
}

function sellerBlock(row: PublicRow, merchants: Map<string, MerchantRow>) {
  const merchant = row.m_id ? (merchants.get(row.m_id) ?? null) : null;
  return {
    name: sellerDisplayName({ full_name: row.u_full_name }, merchant),
    type: merchant ? (merchant.owner_type === "company" ? "dealer" : "merchant") : "private",
  };
}

function summary(row: PublicRow, docs: SaleDocs, merchants: Map<string, MerchantRow>) {
  const cover = docs.photos.front ?? PHOTO_SLOTS.map((s) => docs.photos[s]).find(Boolean);
  return {
    ref: row.ref!,
    title: title(row),
    status: row.status,
    category: row.category,
    make: row.make,
    model: row.model,
    year: row.year,
    mileage_km: row.mileage_km,
    transmission: row.transmission,
    fuel: row.fuel,
    import_status: row.import_status,
    asking_price: askingPrice(row),
    negotiable: row.negotiable,
    county: row.county,
    encumbered: row.encumbered,
    accident_history: row.accident_history,
    cover_url: cover ? photoPath(row.ref!, cover.id) : null,
    seller: sellerBlock(row, merchants),
    live_at: iso(row.live_at),
  };
}

async function merchantsFor(rows: PublicRow[]): Promise<Map<string, MerchantRow>> {
  const ids = [...new Set(rows.map((r) => r.m_id).filter((x): x is string => Boolean(x)))];
  const list = ids.length ? await db<MerchantRow>("merchants").whereIn("id", ids) : [];
  return new Map(list.map((m) => [m.id, m]));
}

// ---------------------------------------------------------------------
// Browse
// ---------------------------------------------------------------------

export async function browseSales(query: BrowseQuery) {
  let base = publicBase();
  if (query.make) base = base.whereRaw("lower(s.make) = lower(?)", [query.make]);
  if (query.category) base = base.where("s.category", query.category);
  if (query.county) base = base.whereRaw("lower(s.county) = lower(?)", [query.county]);
  if (query.import_status) base = base.where("s.import_status", query.import_status);
  if (query.min_price !== undefined) base = base.where("s.asking_price_amount", ">=", query.min_price * 100);
  if (query.max_price !== undefined) base = base.where("s.asking_price_amount", "<=", query.max_price * 100);
  if (query.min_year !== undefined) base = base.where("s.year", ">=", query.min_year);
  if (query.max_year !== undefined) base = base.where("s.year", "<=", query.max_year);
  if (query.max_mileage !== undefined) base = base.where("s.mileage_km", "<=", query.max_mileage);
  if (query.q) {
    const like = `%${query.q.toLowerCase()}%`;
    base = base.where((b) => b.whereRaw("lower(s.make) like ?", [like]).orWhereRaw("lower(s.model) like ?", [like]));
  }

  const total = Number(((await base.clone().count<{ count: string }[]>("s.id as count"))[0]?.count) ?? 0);

  const sortColumn = query.sort === "newest" ? "s.live_at" : "s.asking_price_amount";
  const sortKey = query.sort === "newest" ? "live_at" : "asking_price_amount";
  const direction = query.sort === "price_asc" ? "asc" : "desc";
  const rows = (await applyCursor(base.select("s.*", "u.full_name as u_full_name", "m.id as m_id"), {
    sortColumn,
    idColumn: "s.id",
    direction,
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  })) as unknown as PublicRow[];
  const paged = toPaginatedResult(rows, query.limit, sortKey as keyof PublicRow);
  const [docs, merchants] = await Promise.all([saleDocuments(paged.data.map((r) => r.id)), merchantsFor(paged.data)]);

  // Makes on sale right now, for the filter - bounded by what is listed.
  const makes = await publicBase().distinct("s.make").orderBy("s.make").pluck("s.make");

  return {
    data: paged.data.map((r) => summary(r, docs.get(r.id)!, merchants)),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
    total,
    facets: { makes },
  };
}

// ---------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------

async function requirePublic(ref: string): Promise<PublicRow> {
  const row = (await publicBase()
    .where("s.ref", ref.toUpperCase())
    .select("s.*", "u.full_name as u_full_name", "m.id as m_id")
    .first()) as PublicRow | undefined;
  if (!row) notFound();
  return row;
}

export async function getSale(ref: string) {
  const row = await requirePublic(ref);
  await db("sale_listings").where({ id: row.id }).increment("view_count", 1);
  const [docs, merchants] = await Promise.all([saleDocuments([row.id]), merchantsFor([row])]);
  const d = docs.get(row.id)!;
  return {
    ...summary(row, d, merchants),
    engine_cc: row.engine_cc,
    colour: row.colour,
    drive: row.drive,
    disclosures: disclosuresBlock(row),
    viewing_area: row.viewing_area,
    description: row.description,
    photos: photosOf(row, d),
    // What a reviewer has read. A listing is only public once the logbook
    // and photos were accepted, so `logbook_checked` is always true here -
    // the two optional papers are the ones that vary.
    checks: {
      logbook_checked: true,
      ntsa_search: Boolean(d.ntsa_search && d.ntsa_search.review_state === "ok"),
      bank_clearance_letter: Boolean(d.bank_clearance_letter && d.bank_clearance_letter.review_state === "ok"),
    },
    safety_note: SAFETY_NOTE,
  };
}

export async function readSalePhoto(ref: string, documentId: string) {
  const row = await requirePublic(ref);
  const doc = await db<DocumentRow>("documents")
    .where({ id: documentId, sale_listing_id: row.id, kind: "sale_photo" })
    .first();
  if (!doc) notFound("photo_not_found", "That photo isn't available.");
  const body = await saleStorage()
    .getObject(doc.storage_key)
    .catch(() => notFound("photo_bytes_missing", "That photo is no longer stored."));
  return { body, contentType: doc.content_type, originalName: doc.original_name };
}

// ---------------------------------------------------------------------
// Enquire / report
// ---------------------------------------------------------------------

async function requireBuyer(userId: string): Promise<UserRow> {
  const user = await db<UserRow>("users").where({ id: userId }).first();
  if (!user) throw new ApiError({ status: 401, type: "auth_error", code: "unauthenticated", message: "Sign in again." });
  if (!user.phone_verified) invalid("phone_unverified", "Verify your phone number in your account before contacting a seller.");
  return user;
}

export async function createEnquiry(
  userId: string,
  ref: string,
  input: z.infer<typeof EnquirySchema>,
  ctx: RequestContext,
) {
  const buyer = await requireBuyer(userId);
  const row = await requirePublic(ref);
  if (row.seller_user_id === userId) conflict("own_listing", "This is your own listing.");
  if (row.status !== "live") conflict("listing_under_offer", "This car is under offer. Try again if it comes back on sale.");
  const open = await db<SaleEnquiryRow>("sale_enquiries")
    .where({ sale_listing_id: row.id, buyer_user_id: userId })
    .whereIn("status", ["new", "replied"])
    .first();
  if (open) conflict("enquiry_exists", "You've already asked about this car. The seller's reply will reach you here.");

  // The seller's own switch: hand the number to every buyer who asks.
  const seller = await db<UserRow>("users").where({ id: row.seller_user_id }).first();
  const autoShare = row.auto_share_contact && seller?.phone_verified && seller.phone ? seller.phone : null;
  const now = new Date();

  const sellerIds: string[] = [];
  const buyerIds: string[] = [];
  const enquiry = await db.transaction(async (trx) => {
    const [created] = await trx<SaleEnquiryRow>("sale_enquiries")
      .insert({
        id: generateId("saleEnquiry"),
        sale_listing_id: row.id,
        buyer_user_id: userId,
        message: input.message,
        viewing_window: input.viewing_window ?? null,
        status: autoShare ? "replied" : "new",
        shared_phone: autoShare,
        contact_shared_at: autoShare ? now : null,
      })
      .returning("*");
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "sale_enquiry.created",
      entityType: "sale_enquiry",
      entityId: created!.id,
      after: { sale_listing_id: row.id, auto_shared: Boolean(autoShare) },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    const buyerName = buyer.full_name?.split(" ")[0] ?? "A buyer";
    sellerIds.push(
      await notifySeller(trx, row, {
        category: "enquiry",
        title: `${buyerName} asked about the ${title(row)}`,
        body: input.viewing_window ? `${input.message} (Viewing: ${input.viewing_window})` : input.message,
        ref: row.ref,
        subjectType: "sale_listing",
        subjectId: row.id,
      }),
    );
    if (autoShare) {
      const merchant = row.m_id ? await trx<MerchantRow>("merchants").where({ id: row.m_id }).first() : null;
      const name = sellerDisplayName({ full_name: row.u_full_name }, merchant ?? null);
      buyerIds.push(
        await notify(trx, {
          userId,
          category: "enquiry",
          title: `${name}'s number for the ${title(row)}`,
          body: `Call or text ${name} on ${autoShare}. ${SAFETY_NOTE}`,
          ref: row.ref,
          subjectType: "sale_listing",
          subjectId: row.id,
        }),
      );
    }
    return created!;
  });
  await deliverToSeller(row, sellerIds);
  await enqueueRenterNotificationDelivery(buyerIds);
  return serializeBuyerEnquiry(enquiry, row);
}

export async function reportListing(userId: string, ref: string, input: z.infer<typeof ReportSchema>, ctx: RequestContext) {
  const row = await requirePublic(ref);
  if (row.seller_user_id === userId) conflict("own_listing", "This is your own listing.");
  if (input.reason === "other" && !input.note?.trim()) invalid("note_required", "Say what is wrong with the listing.", "note");
  try {
    await db.transaction(async (trx) => {
      const [created] = await trx<SaleListingReportRow>("sale_listing_reports")
        .insert({
          id: generateId("saleListingReport"),
          sale_listing_id: row.id,
          reporter_user_id: userId,
          reason: input.reason,
          note: input.note?.trim() || null,
        })
        .returning("*");
      await writeAuditEntry(trx, {
        actorId: userId,
        actorType: "user",
        action: "sale_listing.reported",
        entityType: "sale_listing",
        entityId: row.id,
        after: { report_id: created!.id, reason: input.reason },
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) conflict("already_reported", "You've already reported this listing. Ops will look at it.");
    throw err;
  }
  return { reported: true };
}

// ---------------------------------------------------------------------
// The buyer's own enquiries
// ---------------------------------------------------------------------

function serializeBuyerEnquiry(e: SaleEnquiryRow, listing: Pick<SaleListingRow, "ref" | "year" | "make" | "model" | "status">) {
  return {
    id: e.id,
    listing: { ref: listing.ref, title: title(listing), status: listing.status },
    message: e.message,
    viewing_window: e.viewing_window,
    status: e.status,
    reply: e.reply,
    seller_phone: e.shared_phone,
    created_at: e.created_at.toISOString(),
    replied_at: iso(e.replied_at),
  };
}

export async function listMyEnquiries(userId: string, query: { limit: number; cursor?: string | undefined }) {
  const rows = (await applyCursor(
    db<SaleEnquiryRow>("sale_enquiries as e")
      .join("sale_listings as s", "s.id", "e.sale_listing_id")
      .where("e.buyer_user_id", userId)
      .select("e.*", "s.ref as s_ref", "s.year as s_year", "s.make as s_make", "s.model as s_model", "s.status as s_status"),
    {
      sortColumn: "e.created_at",
      idColumn: "e.id",
      direction: "desc",
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    },
  )) as unknown as Array<SaleEnquiryRow & { s_ref: string | null; s_year: number; s_make: string; s_model: string; s_status: SaleListingRow["status"] }>;
  const paged = toPaginatedResult(rows, query.limit, "created_at");
  return {
    data: paged.data.map((e) =>
      serializeBuyerEnquiry(e, { ref: e.s_ref, year: e.s_year, make: e.s_make, model: e.s_model, status: e.s_status }),
    ),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
  };
}


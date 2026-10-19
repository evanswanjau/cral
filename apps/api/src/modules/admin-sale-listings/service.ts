import type { Knex } from "knex";
import { db } from "../../db/client.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { merchantDisplayName } from "../../lib/merchant-display.js";
import { nextSaleRef } from "../../lib/sale-ref.js";
import { effectiveDocState } from "../vehicles/service.js";
import type { DocumentRow, MerchantRow } from "../merchant/db-types.js";
import type { UserRow } from "../auth/db-types.js";
import type { AdminContextInput } from "../admin-vehicles/service.js";
import { PHOTO_SLOTS } from "../sale-listings/schemas.js";
import {
  CASE_STATUSES,
  DOC_LABELS,
  LISTING_LIFETIME_DAYS,
  PHOTO_LABELS,
  askingPrice,
  carBlock,
  conflict,
  deliverToSeller,
  disclosuresBlock,
  invalid,
  iso,
  notFound,
  notifySeller,
  saleDocuments,
  saleStorage,
  sellerGate,
  title,
  type SaleDocs,
} from "../sale-listings/shared.js";
import type {
  SaleListingReportRow,
  SaleListingRow,
  SaleListingStatus,
  SaleReviewCheckRow,
} from "../sale-listings/db-types.js";

/**
 * Ops review of car-sale listings (docs/plans/car-sales.md, openapi/
 * admin-sales.yaml). `admin_reviewer` on the `sales` queue; `admin_super`
 * bypasses both.
 *
 * The canvas's promise is "names and chassis numbers have to agree before
 * the advert appears at all" - comparisons across the logbook, the photos
 * and what the seller typed, which is why this case has a checklist where
 * the driver case has none. The checklist lives here in code rather than in
 * `platform_settings` + `lib/review-checklist.ts`: that library is being
 * reworked on an unmerged branch, and sales should not couple to it yet.
 *
 * Rules: every item answered and none flagged before Approve. Request
 * changes and Reject only need a note. Approving accepts every document a
 * reviewer has not rejected (the checklist is how they were read).
 */

export const SALE_CHECKLIST = [
  { id: "lb_name", section: "logbook", label: "Name on the logbook matches the seller (the person, or the company)" },
  { id: "lb_plate_chassis", section: "logbook", label: "Plate and chassis number on the logbook match the listing" },
  { id: "lb_encumbrance", section: "logbook", label: "Any bank on the logbook matches what the seller declared" },
  { id: "ph_same_car", section: "photos", label: "All eight photos show this car, plate visible front and rear" },
  { id: "ph_chassis", section: "photos", label: "The chassis plate photo matches the logbook's chassis number" },
  { id: "ph_odometer", section: "photos", label: "The odometer reading fits the stated mileage" },
  { id: "ls_faults", section: "listing", label: "The known-faults block is a real answer, not filler" },
  { id: "ls_contact", section: "listing", label: "No phone numbers, links or payment requests in the description" },
  { id: "ls_price", section: "listing", label: "The price is plausible for the car (judgement - there is no valuation data)" },
] as const;
const ITEM_IDS: string[] = SALE_CHECKLIST.map((i) => i.id);

const FILTERS: Record<string, SaleListingStatus[]> = {
  open: ["pending", "review"],
  changes_sent: ["action"],
  listed: ["live", "paused", "under_offer"],
  closed: ["sold", "withdrawn", "expired", "removed", "rejected"],
  all: CASE_STATUSES,
};
export const SALE_QUEUE_FILTERS = [...Object.keys(FILTERS), "reported"];

async function requireCase(listingId: string): Promise<SaleListingRow> {
  const row = await db<SaleListingRow>("sale_listings").where({ id: listingId }).whereIn("status", CASE_STATUSES).first();
  if (!row) notFound("review_case_not_found", "No review case for that listing.");
  return row;
}

async function openReportCounts(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const rows = await db("sale_listing_reports")
    .whereIn("sale_listing_id", ids)
    .where({ status: "open" })
    .groupBy("sale_listing_id")
    .select("sale_listing_id")
    .count<{ sale_listing_id: string; count: string }[]>("* as count");
  for (const r of rows) out.set(r.sale_listing_id, Number(r.count));
  return out;
}

/** The seller as a reviewer needs them: their legal name to hold against the logbook, and their gate. */
async function sellerFor(listing: SaleListingRow) {
  const user = (await db<UserRow>("users").where({ id: listing.seller_user_id }).first())!;
  const merchant = listing.merchant_id
    ? ((await db<MerchantRow>("merchants").where({ id: listing.merchant_id }).first()) ?? null)
    : null;
  const gate = await sellerGate({ user, merchant });
  return {
    type: gate.type,
    user_id: user.id,
    merchant_id: merchant?.id ?? null,
    owner_type: merchant?.owner_type ?? "individual",
    legal_name: merchant ? merchantDisplayName(merchant) : (user.full_name ?? "(no name on file)"),
    email: user.email,
    phone: user.phone,
    phone_verified: user.phone_verified,
    cleared: gate.cleared,
    gate_reason: gate.reason,
  };
}

// ---------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------

export async function listSaleQueue(query: { filter: string; cursor?: string | undefined; limit: number }) {
  let base = db<SaleListingRow>("sale_listings");
  if (query.filter === "reported") {
    base = base
      .whereIn("status", CASE_STATUSES)
      .whereExists(db("sale_listing_reports").whereRaw("sale_listing_id = sale_listings.id").where({ status: "open" }));
  } else {
    base = base.whereIn("status", FILTERS[query.filter] ?? FILTERS.all!);
  }
  const total = Number(((await base.clone().count<{ count: string }[]>("* as count"))[0]?.count) ?? 0);
  const rows = (await applyCursor(base.select("*"), {
    sortColumn: "submitted_at",
    direction: query.filter === "open" ? "asc" : "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  })) as SaleListingRow[];
  const paged = toPaginatedResult(rows, query.limit, "submitted_at");
  const ids = paged.data.map((r) => r.id);
  const [reports, users, merchants] = await Promise.all([
    openReportCounts(ids),
    db<UserRow>("users").whereIn("id", paged.data.map((r) => r.seller_user_id)),
    db<MerchantRow>("merchants").whereIn(
      "id",
      paged.data.map((r) => r.merchant_id).filter((x): x is string => Boolean(x)),
    ),
  ]);

  return {
    data: paged.data.map((r) => {
      const m = merchants.find((x) => x.id === r.merchant_id);
      const u = users.find((x) => x.id === r.seller_user_id);
      return {
        id: r.id,
        ref: r.ref,
        title: title(r),
        registration: r.registration,
        status: r.status,
        asking_price: askingPrice(r),
        county: r.county,
        seller_type: r.merchant_id ? "merchant" : "private",
        seller_name: m ? merchantDisplayName(m) : (u?.full_name ?? ""),
        open_reports: reports.get(r.id) ?? 0,
        submitted_at: iso(r.submitted_at),
      };
    }),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
    total,
  };
}

// ---------------------------------------------------------------------
// Case
// ---------------------------------------------------------------------

function docLine(doc: DocumentRow | undefined) {
  return doc
    ? {
        document_id: doc.id,
        original_name: doc.original_name,
        content_type: doc.content_type,
        state: effectiveDocState(doc),
        review_note: doc.review_note,
      }
    : null;
}

async function checklistFor(listingId: string) {
  const rows = await db<SaleReviewCheckRow>("sale_review_checks").where({ sale_listing_id: listingId });
  const items = SALE_CHECKLIST.map((item) => {
    const a = rows.find((r) => r.item_id === item.id);
    return { ...item, result: a?.result ?? ("pending" as const), note: a?.note ?? null };
  });
  const outstanding = items.filter((i) => i.result === "pending").length;
  const flagged = items.filter((i) => i.result === "flag").length;
  return { items, outstanding, flagged, complete: outstanding === 0 };
}

function suggestedNote(checklist: Awaited<ReturnType<typeof checklistFor>>): string {
  return checklist.items
    .filter((i) => i.result === "flag")
    .map((i) => `- ${i.note?.trim() || i.label}`)
    .join("\n");
}

async function serializeCase(listing: SaleListingRow) {
  const [docs, seller, checklist, reports] = await Promise.all([
    saleDocuments([listing.id]).then((m) => m.get(listing.id)!),
    sellerFor(listing),
    checklistFor(listing.id),
    db<SaleListingReportRow>("sale_listing_reports").where({ sale_listing_id: listing.id }).orderBy("created_at", "desc"),
  ]);
  return {
    id: listing.id,
    ref: listing.ref,
    title: title(listing),
    status: listing.status,
    vehicle_id: listing.vehicle_id,
    car: carBlock(listing),
    asking_price: askingPrice(listing),
    negotiable: listing.negotiable,
    disclosures: disclosuresBlock(listing),
    county: listing.county,
    viewing_area: listing.viewing_area,
    description: listing.description,
    reviewer_note: listing.reviewer_note,
    review_assignee: listing.review_assignee,
    submitted_at: iso(listing.submitted_at),
    live_at: iso(listing.live_at),
    expires_at: iso(listing.expires_at),
    sold_at: iso(listing.sold_at),
    sold_via_cral: listing.sold_via_cral,
    view_count: listing.view_count,
    seller,
    documents: (["logbook", "bank_clearance_letter", "ntsa_search"] as const).map((kind) => ({
      kind,
      label: DOC_LABELS[kind],
      required: kind === "logbook",
      ...{ doc: docLine(docs[kind]) },
    })),
    photos: PHOTO_SLOTS.map((slot) => ({ slot, label: PHOTO_LABELS[slot], doc: docLine(docs.photos[slot]) })),
    checklist: { ...checklist, suggested_note: suggestedNote(checklist) },
    reports: reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      note: r.note,
      status: r.status,
      created_at: r.created_at.toISOString(),
    })),
  };
}

export async function getSaleCase(listingId: string) {
  return serializeCase(await requireCase(listingId));
}

/** Working a case claims it: an open, unassigned case moves to "with you". */
async function claim(trx: Knex.Transaction, listing: SaleListingRow, adminId: string) {
  if (listing.status === "pending" || (listing.status === "review" && !listing.review_assignee)) {
    await trx("sale_listings").where({ id: listing.id }).update({ status: "review", review_assignee: adminId });
  }
}

export async function assignSaleCase(listingId: string, admin: AdminContextInput) {
  const listing = await requireCase(listingId);
  await db.transaction(async (trx) => {
    await trx("sale_listings")
      .where({ id: listing.id })
      .update({
        review_assignee: admin.adminId,
        ...(listing.status === "pending" ? { status: "review" } : {}),
      });
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: "sale_listing.assigned",
      entityType: "sale_listing",
      entityId: listing.id,
      before: { review_assignee: listing.review_assignee },
      after: { review_assignee: admin.adminId },
      requestId: admin.requestId,
      ip: admin.ip,
    });
  });
  return getSaleCase(listingId);
}

// ---------------------------------------------------------------------
// Checklist + documents
// ---------------------------------------------------------------------

export async function setSaleCheck(
  listingId: string,
  input: { item_id: string; result: "pass" | "flag" | "pending"; note?: string | undefined },
  admin: AdminContextInput,
) {
  if (!ITEM_IDS.includes(input.item_id)) invalid("unknown_check", "That isn't an item on the sale checklist.", "item_id");
  const listing = await requireCase(listingId);
  if (listing.status !== "pending" && listing.status !== "review") {
    conflict("case_not_open", "The checklist is only open while the listing is waiting for a decision.");
  }
  await db.transaction(async (trx) => {
    if (input.result === "pending") {
      await trx("sale_review_checks").where({ sale_listing_id: listing.id, item_id: input.item_id }).delete();
    } else {
      await trx("sale_review_checks")
        .insert({
          sale_listing_id: listing.id,
          item_id: input.item_id,
          result: input.result,
          note: input.note?.trim() || null,
          answered_by: admin.adminId,
        })
        .onConflict(["sale_listing_id", "item_id"])
        .merge(["result", "note", "answered_by", "updated_at"]);
    }
    await claim(trx, listing, admin.adminId);
  });
  return getSaleCase(listingId);
}

export async function decideSaleDocument(
  listingId: string,
  documentId: string,
  decision: "accept" | "reject",
  note: string | null,
  admin: AdminContextInput,
) {
  const listing = await requireCase(listingId);
  if (decision === "reject" && !note?.trim()) {
    invalid("reason_required", "Write what the seller should read before asking for a new upload.", "note");
  }
  const doc = await db<DocumentRow>("documents").where({ id: documentId, sale_listing_id: listing.id }).first();
  if (!doc) notFound("document_not_found", "That document isn't on this listing.");
  const next = decision === "accept" ? "ok" : "rejected";
  await db.transaction(async (trx) => {
    await trx<DocumentRow>("documents").where({ id: doc.id }).update({
      review_state: next,
      review_note: decision === "reject" ? note!.trim() : null,
      reviewed_by: admin.adminId,
      reviewed_at: new Date(),
    });
    await claim(trx, listing, admin.adminId);
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: decision === "accept" ? "admin.document_accepted" : "admin.document_rejected",
      entityType: "document",
      entityId: doc.id,
      before: { review_state: doc.review_state },
      after: { review_state: next, kind: doc.kind, slot: doc.slot, sale_listing_id: listing.id },
      requestId: admin.requestId,
      ip: admin.ip,
    });
  });
  return getSaleCase(listingId);
}

// ---------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------

export type SaleAction = "approve" | "request_changes" | "reject";

function blockingDocs(docs: SaleDocs): string[] {
  const out: string[] = [];
  if (!docs.logbook || docs.logbook.review_state === "rejected") out.push("logbook");
  for (const s of PHOTO_SLOTS) {
    if (!docs.photos[s] || docs.photos[s]!.review_state === "rejected") out.push(`photo: ${PHOTO_LABELS[s].toLowerCase()}`);
  }
  return out;
}

export async function decideSaleListing(listingId: string, action: SaleAction, note: string | null, admin: AdminContextInput) {
  const listing = await requireCase(listingId);
  if (listing.status !== "pending" && listing.status !== "review") {
    conflict("case_not_open", "This listing isn't waiting for a decision.");
  }
  if (action !== "approve" && !note?.trim()) invalid("reason_required", "Write what the seller should read.", "note");

  const docs = (await saleDocuments([listing.id])).get(listing.id)!;
  let checklist: Awaited<ReturnType<typeof checklistFor>> | null = null;
  if (action === "approve") {
    const seller = await sellerFor(listing);
    if (!seller.cleared) {
      invalid(
        seller.type === "merchant" ? "merchant_not_approved" : "seller_not_verified",
        seller.type === "merchant"
          ? "Approve the merchant's account on the merchant file first."
          : `The seller isn't verified yet: ${seller.gate_reason}`,
      );
    }
    const blocking = blockingDocs(docs);
    if (blocking.length) invalid("documents_incomplete", `These need a good upload first: ${blocking.join(", ")}.`);
    checklist = await checklistFor(listing.id);
    if (!checklist.complete) invalid("checklist_incomplete", `Answer every check first - ${checklist.outstanding} still open.`);
    if (checklist.flagged) invalid("checklist_flagged", "Something is flagged. Request changes or reject instead.");
  }

  const now = new Date();
  const status: SaleListingStatus = action === "approve" ? "live" : action === "request_changes" ? "action" : "rejected";
  const ids: string[] = [];
  const updated = await db.transaction(async (trx) => {
    const patch: Partial<SaleListingRow> = {
      status,
      reviewer_note: action === "approve" ? null : note!.trim(),
      review_assignee: admin.adminId,
      decided_at: now,
    };
    if (action === "approve") {
      patch.ref = listing.ref ?? (await nextSaleRef(trx));
      patch.live_at = listing.live_at ?? now;
      patch.expires_at = new Date(now.getTime() + LISTING_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
      patch.expiry_reminded_at = null;
      // The checklist is how the documents were read - accept what is left.
      await trx<DocumentRow>("documents")
        .where({ sale_listing_id: listing.id, review_state: "pending" })
        .update({ review_state: "ok", reviewed_by: admin.adminId, reviewed_at: now });
    }
    const [row] = await trx<SaleListingRow>("sale_listings")
      .where({ id: listing.id, status: listing.status })
      .update(patch)
      .returning("*");
    if (!row) conflict("sale_listing_changed", "This listing changed - reload and try again.");
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: `sale_listing.${action === "approve" ? "approved" : action === "request_changes" ? "changes_requested" : "rejected"}`,
      entityType: "sale_listing",
      entityId: listing.id,
      before: { status: listing.status },
      after: {
        status,
        ref: row.ref,
        note: patch.reviewer_note,
        checklist: checklist ? Object.fromEntries(checklist.items.map((i) => [i.id, i.result])) : null,
      },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    ids.push(
      await notifySeller(trx, row, {
        category: "review",
        title:
          action === "approve"
            ? `${title(row)} is listed for sale`
            : action === "request_changes"
              ? `${title(row)} needs a change before it is listed`
              : `${title(row)} was not listed`,
        body: action === "approve" ? `Listed as ${row.ref}. Buyers can enquire from today for 60 days.` : note!.trim(),
        ref: row.ref,
        subjectType: "sale_listing",
        subjectId: row.id,
      }),
    );
    return row;
  });
  await deliverToSeller(updated, ids);
  return serializeCase(updated);
}

// ---------------------------------------------------------------------
// Takedown / reinstate
// ---------------------------------------------------------------------

export async function removeSaleListing(listingId: string, note: string, admin: AdminContextInput) {
  const listing = await requireCase(listingId);
  if (!["live", "paused", "under_offer"].includes(listing.status)) {
    conflict("not_listed", "Only a listed car can be taken down.");
  }
  if (!note.trim()) invalid("reason_required", "Write why the listing is coming down - the seller reads it.", "note");
  const ids: string[] = [];
  const updated = await db.transaction(async (trx) => {
    if (listing.paused_hire && listing.vehicle_id) {
      await trx("vehicles").where({ id: listing.vehicle_id, status: "paused" }).whereNull("sold_at").update({ status: "live" });
    }
    const [row] = await trx<SaleListingRow>("sale_listings")
      .where({ id: listing.id, status: listing.status })
      .update({ status: "removed", reviewer_note: note.trim(), paused_hire: false, decided_at: new Date() })
      .returning("*");
    if (!row) conflict("sale_listing_changed", "This listing changed - reload and try again.");
    await trx("sale_listing_reports")
      .where({ sale_listing_id: listing.id, status: "open" })
      .update({ status: "actioned", resolved_by: admin.adminId, resolved_at: new Date() });
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: "sale_listing.removed",
      entityType: "sale_listing",
      entityId: listing.id,
      before: { status: listing.status },
      after: { status: "removed", note: note.trim() },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    ids.push(
      await notifySeller(trx, row, {
        category: "review",
        title: `${title(row)} was taken down`,
        body: note.trim(),
        ref: row.ref,
        subjectType: "sale_listing",
        subjectId: row.id,
      }),
    );
    return row;
  });
  await deliverToSeller(updated, ids);
  return serializeCase(updated);
}

export async function reinstateSaleListing(listingId: string, admin: AdminContextInput) {
  const listing = await requireCase(listingId);
  if (listing.status !== "removed") conflict("not_removed", "Only a taken-down listing can be reinstated.");
  const ids: string[] = [];
  const now = new Date();
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<SaleListingRow>("sale_listings")
      .where({ id: listing.id, status: "removed" })
      .update({
        status: "live",
        reviewer_note: null,
        expires_at: new Date(now.getTime() + LISTING_LIFETIME_DAYS * 24 * 60 * 60 * 1000),
        decided_at: now,
      })
      .returning("*");
    if (!row) conflict("sale_listing_changed", "This listing changed - reload and try again.");
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: "sale_listing.reinstated",
      entityType: "sale_listing",
      entityId: listing.id,
      before: { status: "removed" },
      after: { status: "live" },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    ids.push(
      await notifySeller(trx, row, {
        category: "review",
        title: `${title(row)} is listed again`,
        body: "Ops reviewed the listing and put it back on sale.",
        ref: row.ref,
        subjectType: "sale_listing",
        subjectId: row.id,
      }),
    );
    return row;
  });
  await deliverToSeller(updated, ids);
  return serializeCase(updated);
}

export async function resolveSaleReport(reportId: string, outcome: "dismissed" | "actioned", admin: AdminContextInput) {
  const report = await db<SaleListingReportRow>("sale_listing_reports").where({ id: reportId }).first();
  if (!report) notFound("report_not_found", "No such report.");
  if (report.status !== "open") conflict("report_resolved", "This report is already resolved.");
  await db.transaction(async (trx) => {
    await trx("sale_listing_reports")
      .where({ id: report.id })
      .update({ status: outcome, resolved_by: admin.adminId, resolved_at: new Date() });
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: `sale_report.${outcome}`,
      entityType: "sale_listing",
      entityId: report.sale_listing_id,
      after: { report_id: report.id, outcome },
      requestId: admin.requestId,
      ip: admin.ip,
    });
  });
  return getSaleCase(report.sale_listing_id);
}

// ---------------------------------------------------------------------
// Document bytes
// ---------------------------------------------------------------------

export async function readSaleCaseDocument(listingId: string, documentId: string) {
  const listing = await requireCase(listingId);
  const doc = await db<DocumentRow>("documents").where({ id: documentId, sale_listing_id: listing.id }).first();
  if (!doc) notFound("document_not_found", "That document isn't on this listing.");
  const body = await saleStorage()
    .getObject(doc.storage_key)
    .catch(() => notFound("document_bytes_missing", "That file is no longer stored."));
  return { body, contentType: doc.content_type, originalName: doc.original_name };
}

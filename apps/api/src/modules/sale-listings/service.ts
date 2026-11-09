import type { Knex } from "knex";
import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { isUniqueViolation } from "../../lib/pg-errors.js";
import { notify } from "../../lib/notifications.js";
import { enqueueRenterNotificationDelivery } from "../../jobs/notification-delivery.js";
import type { RequestContext } from "../merchant/service.js";
import type { DocumentRow, VehicleRow } from "../merchant/db-types.js";
import {
  LISTING_LIFETIME_DAYS,
  OPEN_STATUSES,
  PRIVATE_LISTING_LIMIT,
  conflict,
  deliverToSeller,
  enquiryCounts,
  invalid,
  loadSeller,
  missingForSubmit,
  normalizePlate,
  notFound,
  notifySeller,
  saleDocuments,
  saleStorage,
  sellerDisplayName,
  sellerGate,
  serializeForSeller,
  title,
  type Seller,
} from "./shared.js";
import {
  REVIEWED_FIELDS,
  type CreateSaleListingInput,
  type ReplyEnquiryInput,
  type SaleDocumentKind,
  type PhotoSlot,
  type SetSaleStatusInput,
  type UpdateSaleListingInput,
} from "./schemas.js";
import type { SaleEnquiryRow, SaleListingRow, SaleListingStatus } from "./db-types.js";

/**
 * Seller side of car sales (owner's call, 2026-10-19 -
 * docs/plans/car-sales.md, openapi/sales-seller.yaml).
 *
 * A listing is a draft the seller builds (details, disclosures, the
 * logbook and eight photos), submits, and an Ops reviewer approves before
 * it is listed. From there the seller moves it between live / paused /
 * under offer / sold / withdrawn; it expires after 60 days and renews in
 * one tap. Nothing here touches money - CRAL takes no fee and holds nothing.
 */

/** Everything can be edited before a reviewer has it, or once it's sent back. */
const FREELY_EDITABLE: SaleListingStatus[] = ["draft", "action", "rejected"];
/** Reviewed details can change here, but the listing goes back to review. */
const RE_REVIEW_ON_EDIT: SaleListingStatus[] = ["live", "paused"];
/** Price, description and viewing details can change in any of these. */
const PRICE_EDITABLE: SaleListingStatus[] = [
  "draft",
  "pending",
  "review",
  "action",
  "rejected",
  "live",
  "paused",
  "under_offer",
];

function shillingsToCents(value: string): number {
  return Number(value) * 100;
}

async function requireOwnListing(userId: string, listingId: string): Promise<SaleListingRow> {
  const row = await db<SaleListingRow>("sale_listings").where({ id: listingId, seller_user_id: userId }).first();
  if (!row) notFound("sale_listing_not_found", "That listing isn't on your account.");
  return row;
}

async function serializeOne(seller: Seller, row: SaleListingRow) {
  const [docs, counts, gate] = await Promise.all([saleDocuments([row.id]), enquiryCounts([row.id]), sellerGate(seller)]);
  return serializeForSeller(row, docs.get(row.id)!, gate, counts.get(row.id)!);
}

/**
 * One open sale per car, and never a car another account has in its fleet.
 * The partial unique indexes enforce the first under concurrency; the
 * second spans `vehicles`, so it is checked here under an advisory lock on
 * the normalised plate, taken inside the writing transaction.
 */
async function assertPlateFree(
  trx: Knex.Transaction,
  seller: Seller,
  registration: string,
  vehicleId: string | null,
): Promise<string | null> {
  const plate = normalizePlate(registration);
  await trx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`sale-plate:${plate}`]);
  const fleet = await trx<VehicleRow>("vehicles")
    .whereRaw("upper(regexp_replace(registration, '[^A-Za-z0-9]', '', 'g')) = ?", [plate])
    // A car sold through CRAL belongs to someone else now - its old fleet
    // row must not stop the new owner selling it on.
    .whereNull("sold_at")
    .first();
  if (!fleet) return vehicleId;
  if (!seller.merchant || fleet.merchant_id !== seller.merchant.id) {
    conflict("registration_taken", "That car is listed on CRAL by another account.");
  }
  // The seller's own fleet car - link it even if they started from scratch.
  return fleet.id;
}

function rethrowSaleConflict(err: unknown): never {
  if (isUniqueViolation(err, "sale_listings_registration_open_unique")) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "registration_taken",
      message: "That car already has an open sale listing on CRAL.",
      field: "registration",
    });
  }
  if (isUniqueViolation(err, "sale_listings_chassis_open_unique")) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "chassis_taken",
      message: "A car with that chassis number already has an open sale listing on CRAL.",
      field: "chassis_number",
    });
  }
  throw err;
}

// ---------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------

export async function listMySaleListings(userId: string, query: { limit: number; cursor?: string | undefined }) {
  const seller = await loadSeller(userId);
  const all = await db<SaleListingRow>("sale_listings").where({ seller_user_id: userId }).select("id", "status");
  const allCounts = await enquiryCounts(all.map((r) => r.id));
  const counts = {
    all: all.length,
    live: all.filter((r) => r.status === "live" || r.status === "under_offer").length,
    needs_action: all.filter((r) => r.status === "action" || r.status === "rejected").length,
    new_enquiries: [...allCounts.values()].reduce((n, c) => n + c.new, 0),
  };

  const rows = (await applyCursor(db<SaleListingRow>("sale_listings").where({ seller_user_id: userId }).select("*"), {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  })) as SaleListingRow[];
  const paged = toPaginatedResult(rows, query.limit, "created_at");
  const [docs, gate] = await Promise.all([saleDocuments(paged.data.map((r) => r.id)), sellerGate(seller)]);
  return {
    data: paged.data.map((r) => serializeForSeller(r, docs.get(r.id)!, gate, allCounts.get(r.id)!)),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
    counts,
    seller: { type: gate.type, cleared: gate.cleared, reason: gate.reason, limit: gate.type === "private" ? PRIVATE_LISTING_LIMIT : null },
  };
}

export async function getMySaleListing(userId: string, listingId: string) {
  const seller = await loadSeller(userId);
  return serializeOne(seller, await requireOwnListing(userId, listingId));
}

// ---------------------------------------------------------------------
// Create / edit / delete
// ---------------------------------------------------------------------

export async function createSaleListing(userId: string, input: CreateSaleListingInput, ctx: RequestContext) {
  const seller = await loadSeller(userId);

  if (!seller.merchant) {
    const open = await db("sale_listings")
      .where({ seller_user_id: userId })
      .whereIn("status", OPEN_STATUSES)
      .count<{ count: string }[]>("* as count");
    if (Number(open[0]?.count ?? 0) >= PRIVATE_LISTING_LIMIT) {
      conflict(
        "private_listing_limit",
        `A private account can have ${PRIVATE_LISTING_LIMIT} cars for sale at once. Selling more? List them as a business on the merchant portal.`,
      );
    }
  }

  let fleet: VehicleRow | undefined;
  if (input.vehicle_id) {
    if (!seller.merchant) notFound("vehicle_not_found", "That vehicle isn't on your account.");
    fleet = await db<VehicleRow>("vehicles").where({ id: input.vehicle_id, merchant_id: seller.merchant.id }).first();
    if (!fleet) notFound("vehicle_not_found", "That vehicle isn't on your account.");
    if (fleet.sold_at) conflict("vehicle_sold", "That car has already been sold.");
    if (normalizePlate(fleet.registration) !== normalizePlate(input.registration)) {
      invalid("registration_mismatch", "The plate doesn't match the fleet car you're selling.", "registration");
    }
  }

  const row = await db
    .transaction(async (trx) => {
      const vehicleId = await assertPlateFree(trx, seller, input.registration, fleet?.id ?? null);
      const [created] = await trx<SaleListingRow>("sale_listings")
        .insert({
          id: generateId("saleListing"),
          seller_user_id: userId,
          merchant_id: seller.merchant?.id ?? null,
          vehicle_id: vehicleId,
          category: input.category,
          make: input.make,
          model: input.model,
          year: input.year,
          registration: input.registration.toUpperCase(),
          chassis_number: input.chassis_number.toUpperCase(),
          mileage_km: input.mileage_km,
          engine_cc: input.engine_cc ?? null,
          transmission: input.transmission,
          fuel: input.fuel,
          colour: input.colour ?? null,
          drive: input.drive ?? null,
          import_status: input.import_status,
          asking_price_amount: shillingsToCents(input.asking_price),
          asking_price_currency: "KES",
          negotiable: input.negotiable ?? true,
          known_faults: input.known_faults,
          accident_history: input.accident_history,
          accident_note: input.accident_note ?? null,
          encumbered: input.encumbered,
          service_history: input.service_history,
          county: input.county,
          viewing_area: input.viewing_area,
          description: input.description ?? null,
          auto_share_contact: input.auto_share_contact ?? false,
          status: "draft",
        })
        .returning("*");
      if (!created) throw new Error("Failed to create sale listing");
      await writeAuditEntry(trx, {
        actorId: userId,
        actorType: "user",
        action: "sale_listing.created",
        entityType: "sale_listing",
        entityId: created.id,
        after: { title: title(created), vehicle_id: created.vehicle_id },
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
      return created;
    })
    .catch(rethrowSaleConflict);

  // A fleet car's logbook is already on file - copy the bytes so the sale
  // listing owns its own document (sharing a storage key would let one
  // delete take the other's file with it).
  if (row.vehicle_id) await copyFleetLogbook(row).catch(() => undefined);

  return serializeOne(seller, row);
}

async function copyFleetLogbook(listing: SaleListingRow): Promise<void> {
  const source = await db<DocumentRow>("documents").where({ vehicle_id: listing.vehicle_id!, kind: "logbook" }).first();
  if (!source) return;
  const body = await saleStorage().getObject(source.storage_key);
  const id = generateId("document");
  const key = `sales/${listing.id}/logbook/${id}-${source.original_name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(-100)}`;
  await saleStorage().putObject({ key, body, contentType: source.content_type });
  await db<DocumentRow>("documents").insert({
    id,
    merchant_id: null,
    user_id: null,
    vehicle_id: null,
    driver_id: null,
    sale_listing_id: listing.id,
    slot: null,
    kind: "logbook",
    storage_key: key,
    original_name: source.original_name,
    size_bytes: source.size_bytes,
    content_type: source.content_type,
    review_state: "pending",
    expires_at: null,
  });
}

export async function updateSaleListing(userId: string, listingId: string, input: UpdateSaleListingInput, ctx: RequestContext) {
  const seller = await loadSeller(userId);
  const listing = await requireOwnListing(userId, listingId);

  const touched = Object.keys(input).filter((k) => input[k as keyof UpdateSaleListingInput] !== undefined);
  if (!touched.length) return serializeOne(seller, listing);
  const reviewedTouched = touched.some((k) => (REVIEWED_FIELDS as readonly string[]).includes(k));

  if (!PRICE_EDITABLE.includes(listing.status)) {
    conflict("sale_listing_closed", "This listing is closed and can't be changed.");
  }
  if (reviewedTouched && !FREELY_EDITABLE.includes(listing.status) && !RE_REVIEW_ON_EDIT.includes(listing.status)) {
    conflict(
      "sale_listing_locked",
      listing.status === "under_offer"
        ? "Put the listing back on sale before changing the car's details."
        : "A reviewer has this listing. Wait for their decision before changing the car's details.",
    );
  }
  if (input.registration && listing.vehicle_id && normalizePlate(input.registration) !== normalizePlate(listing.registration)) {
    invalid("registration_mismatch", "The plate of a fleet car can't change here.", "registration");
  }

  const update: Partial<SaleListingRow> = {};
  for (const k of touched) {
    const v = input[k as keyof UpdateSaleListingInput];
    if (k === "asking_price") update.asking_price_amount = shillingsToCents(v as string);
    else if (k === "registration" || k === "chassis_number") (update as Record<string, unknown>)[k] = (v as string).toUpperCase();
    else (update as Record<string, unknown>)[k] = v ?? null;
  }
  // A reviewer read the old details; changing them on a listed car takes it
  // down until someone reads the new ones.
  const backToReview = reviewedTouched && RE_REVIEW_ON_EDIT.includes(listing.status);
  if (backToReview) {
    update.status = "pending";
    update.submitted_at = new Date();
  }

  const updated = await db
    .transaction(async (trx) => {
      if (update.registration) await assertPlateFree(trx, seller, update.registration, listing.vehicle_id);
      const [row] = await trx<SaleListingRow>("sale_listings").where({ id: listing.id }).update(update).returning("*");
      if (!row) throw new Error("Failed to update sale listing");
      if (backToReview) await trx("sale_review_checks").where({ sale_listing_id: listing.id }).delete();
      await writeAuditEntry(trx, {
        actorId: userId,
        actorType: "user",
        action: "sale_listing.updated",
        entityType: "sale_listing",
        entityId: listing.id,
        before: Object.fromEntries(Object.keys(update).map((k) => [k, listing[k as keyof SaleListingRow]])),
        after: update,
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
      return row;
    })
    .catch(rethrowSaleConflict);

  return serializeOne(seller, updated);
}

export async function deleteSaleListing(userId: string, listingId: string, ctx: RequestContext) {
  const listing = await requireOwnListing(userId, listingId);
  if (listing.status !== "draft") conflict("not_draft", "Only a draft can be deleted. Withdraw the listing instead.");
  const docs = await db<DocumentRow>("documents").where({ sale_listing_id: listing.id }).select("storage_key");
  await db.transaction(async (trx) => {
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "sale_listing.deleted",
      entityType: "sale_listing",
      entityId: listing.id,
      before: { title: title(listing), status: listing.status },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    await trx("sale_listings").where({ id: listing.id }).delete();
  });
  // Rows first, bytes second - same order as every other document delete.
  for (const d of docs) await saleStorage().deleteObject(d.storage_key).catch(() => undefined);
}

// ---------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------

export interface UploadSaleDocumentInput {
  kind: SaleDocumentKind;
  slot?: PhotoSlot | undefined;
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
}

export async function uploadSaleDocument(
  userId: string,
  listingId: string,
  input: UploadSaleDocumentInput,
  ctx: RequestContext,
) {
  const seller = await loadSeller(userId);
  const listing = await requireOwnListing(userId, listingId);
  if (!FREELY_EDITABLE.includes(listing.status) && !RE_REVIEW_ON_EDIT.includes(listing.status)) {
    conflict(
      "sale_listing_locked",
      listing.status === "pending" || listing.status === "review"
        ? "A reviewer has this listing. Wait for their decision before changing its documents."
        : "This listing's documents can't be changed now.",
    );
  }
  if (input.kind === "sale_photo" && !input.slot) invalid("slot_required", "Say which photo this is.", "slot");
  if (input.kind !== "sale_photo" && input.slot) invalid("slot_not_allowed", "Only photos have a slot.", "slot");
  if (input.kind === "sale_photo" && !input.file.mimetype.startsWith("image/")) {
    invalid("photo_must_be_image", "A photo has to be a JPEG, PNG or WebP image.", "file");
  }

  const safeName = input.file.originalname.replace(/[^A-Za-z0-9_.-]/g, "_").slice(-100);
  const docId = generateId("document");
  const key = `sales/${listing.id}/${input.kind}/${input.slot ? `${input.slot}/` : ""}${docId}-${safeName}`;
  await saleStorage().putObject({ key, body: input.file.buffer, contentType: input.file.mimetype });

  const backToReview = RE_REVIEW_ON_EDIT.includes(listing.status);
  let replacedKeys: string[] = [];
  const updated = await db.transaction(async (trx) => {
    const superseded = await trx<DocumentRow>("documents")
      .where({ sale_listing_id: listing.id, kind: input.kind, slot: input.slot ?? null })
      .delete()
      .returning("storage_key");
    replacedKeys = superseded.map((d) => d.storage_key);
    await trx<DocumentRow>("documents").insert({
      id: docId,
      merchant_id: null,
      user_id: null,
      vehicle_id: null,
      driver_id: null,
      sale_listing_id: listing.id,
      slot: input.slot ?? null,
      kind: input.kind,
      storage_key: key,
      original_name: input.file.originalname,
      size_bytes: input.file.size,
      content_type: input.file.mimetype,
      review_state: "pending",
      expires_at: null,
    });
    let row = listing;
    if (backToReview) {
      [row] = (await trx<SaleListingRow>("sale_listings")
        .where({ id: listing.id })
        .update({ status: "pending", submitted_at: new Date() })
        .returning("*")) as [SaleListingRow];
      await trx("sale_review_checks").where({ sale_listing_id: listing.id }).delete();
    }
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "sale_listing.document_uploaded",
      entityType: "sale_listing",
      entityId: listing.id,
      after: { kind: input.kind, slot: input.slot ?? null, original_name: input.file.originalname },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });
  for (const k of replacedKeys) await saleStorage().deleteObject(k).catch(() => undefined);

  return serializeOne(seller, updated);
}

export async function readOwnSaleDocument(userId: string, listingId: string, documentId: string) {
  const listing = await requireOwnListing(userId, listingId);
  const doc = await db<DocumentRow>("documents").where({ id: documentId, sale_listing_id: listing.id }).first();
  if (!doc) notFound("document_not_found", "That document isn't on this listing.");
  const body = await saleStorage()
    .getObject(doc.storage_key)
    .catch(() => notFound("document_bytes_missing", "That file is no longer stored."));
  return { body, contentType: doc.content_type, originalName: doc.original_name };
}

// ---------------------------------------------------------------------
// Submit / renew
// ---------------------------------------------------------------------

export async function submitSaleListing(userId: string, listingId: string, ctx: RequestContext) {
  const seller = await loadSeller(userId);
  const listing = await requireOwnListing(userId, listingId);
  if (!FREELY_EDITABLE.includes(listing.status)) {
    conflict("not_submittable", "Only a draft, or a listing sent back to you, can be sent for review.");
  }
  if (!seller.merchant && !seller.user.phone_verified) {
    invalid("phone_unverified", "Verify your phone number first - buyers need a way to reach you.");
  }
  const missing = missingForSubmit((await saleDocuments([listing.id])).get(listing.id)!);
  if (missing.length) invalid("documents_incomplete", `Add the ${missing.join(" and ")} first.`);

  const notificationIds: string[] = [];
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<SaleListingRow>("sale_listings")
      .where({ id: listing.id, status: listing.status })
      .update({ status: "pending", submitted_at: new Date() })
      .returning("*");
    if (!row) conflict("sale_listing_changed", "This listing changed - reload and try again.");
    // A resubmission is read afresh: a reviewer's earlier answers were
    // about the version they sent back.
    await trx("sale_review_checks").where({ sale_listing_id: listing.id }).delete();
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "sale_listing.submitted",
      entityType: "sale_listing",
      entityId: listing.id,
      before: { status: listing.status },
      after: { status: "pending" },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    notificationIds.push(
      await notifySeller(trx, row, {
        category: "review",
        title: `${title(row)} is in the review queue`,
        body: "A person reads the logbook against the photos before it is listed. Usually inside one working day.",
        ref: null,
        subjectType: "sale_listing",
        subjectId: row.id,
      }),
    );
    return row;
  });
  await deliverToSeller(updated, notificationIds);
  return serializeOne(seller, updated);
}

export async function renewSaleListing(userId: string, listingId: string, ctx: RequestContext) {
  const seller = await loadSeller(userId);
  const listing = await requireOwnListing(userId, listingId);
  const renewable = listing.status === "expired" || listing.status === "live";
  if (!renewable) conflict("not_renewable", "Only a live or expired listing can be renewed.");

  const expiresAt = new Date(Date.now() + LISTING_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  const updated = await db
    .transaction(async (trx) => {
      const [row] = await trx<SaleListingRow>("sale_listings")
        .where({ id: listing.id, status: listing.status })
        .update({ status: "live", expires_at: expiresAt, expiry_reminded_at: null })
        .returning("*");
      if (!row) conflict("sale_listing_changed", "This listing changed - reload and try again.");
      await writeAuditEntry(trx, {
        actorId: userId,
        actorType: "user",
        action: "sale_listing.renewed",
        entityType: "sale_listing",
        entityId: listing.id,
        before: { status: listing.status, expires_at: listing.expires_at },
        after: { status: "live", expires_at: expiresAt },
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
      return row;
    })
    .catch(rethrowSaleConflict);
  return serializeOne(seller, updated);
}

// ---------------------------------------------------------------------
// Status moves - and what they do to a fleet car's hire listing
// ---------------------------------------------------------------------

const ALLOWED_FROM: Record<SetSaleStatusInput["to"], SaleListingStatus[]> = {
  paused: ["live"],
  live: ["paused", "under_offer"],
  under_offer: ["live", "paused"],
  sold: ["live", "paused", "under_offer"],
  withdrawn: ["draft", "pending", "review", "action", "rejected", "live", "paused", "under_offer"],
};

/** Hire bookings that still need the car - selling it would strand them. */
const BOOKINGS_IN_FLIGHT = ["requested", "confirmed", "active"];

export async function setSaleStatus(userId: string, listingId: string, input: SetSaleStatusInput, ctx: RequestContext) {
  const seller = await loadSeller(userId);
  const listing = await requireOwnListing(userId, listingId);
  if (!ALLOWED_FROM[input.to].includes(listing.status)) {
    conflict("invalid_transition", `A listing that is ${listing.status.replace("_", " ")} can't be marked ${input.to.replace("_", " ")}.`);
  }

  if (input.to === "sold" && listing.vehicle_id) {
    const inFlight = await db("bookings")
      .where({ vehicle_id: listing.vehicle_id })
      .whereIn("status", BOOKINGS_IN_FLIGHT)
      .first("ref");
    if (inFlight) {
      conflict(
        "vehicle_has_upcoming_bookings",
        `Booking ${inFlight.ref as string} still needs this car. Complete, decline or cancel it before marking the car sold.`,
      );
    }
  }

  const updated = await db.transaction(async (trx) => {
    const patch: Partial<SaleListingRow> = { status: input.to };
    if (input.to === "sold") {
      patch.sold_at = new Date();
      patch.sold_via_cral = input.sold_via_cral ?? null;
    }

    const vehicle = listing.vehicle_id
      ? await trx<VehicleRow>("vehicles").where({ id: listing.vehicle_id }).forUpdate().first()
      : undefined;
    if (vehicle) {
      // Under offer: the car stops taking hires until the sale settles
      // (owner's call, 2026-10-19 - hireable until then).
      if (input.to === "under_offer" && vehicle.status === "live") {
        await trx("vehicles").where({ id: vehicle.id }).update({ status: "paused" });
        patch.paused_hire = true;
      }
      // Back on sale, or withdrawn: give back the hires the sale took away.
      if ((input.to === "live" || input.to === "withdrawn") && listing.paused_hire) {
        if (vehicle.status === "paused" && !vehicle.sold_at) {
          await trx("vehicles").where({ id: vehicle.id }).update({ status: "live" });
        }
        patch.paused_hire = false;
      }
      if (input.to === "sold") {
        await trx("vehicles").where({ id: vehicle.id }).update({
          status: vehicle.status === "live" ? "paused" : vehicle.status,
          sold_at: new Date(),
        });
        patch.paused_hire = false;
      }
    }

    const [row] = await trx<SaleListingRow>("sale_listings")
      .where({ id: listing.id, status: listing.status })
      .update(patch)
      .returning("*");
    if (!row) conflict("sale_listing_changed", "This listing changed - reload and try again.");
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: `sale_listing.${input.to}`,
      entityType: "sale_listing",
      entityId: listing.id,
      before: { status: listing.status },
      after: { status: input.to, sold_via_cral: patch.sold_via_cral ?? null, vehicle_id: listing.vehicle_id },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  return serializeOne(seller, updated);
}

// ---------------------------------------------------------------------
// The seller's enquiry inbox
// ---------------------------------------------------------------------

function serializeEnquiryForSeller(e: SaleEnquiryRow & { buyer_name: string | null }, listing: Pick<SaleListingRow, "id" | "ref" | "year" | "make" | "model">) {
  return {
    id: e.id,
    listing: { id: listing.id, ref: listing.ref, title: title(listing) },
    buyer_name: e.buyer_name?.split(" ")[0] ?? "A buyer",
    message: e.message,
    viewing_window: e.viewing_window,
    status: e.status,
    reply: e.reply,
    contact_shared: e.contact_shared_at !== null,
    created_at: e.created_at.toISOString(),
    replied_at: e.replied_at ? e.replied_at.toISOString() : null,
  };
}

export async function listSellerInbox(
  userId: string,
  query: { limit: number; cursor?: string | undefined; status: "open" | "all"; listing_id?: string | undefined },
) {
  let base = db<SaleEnquiryRow>("sale_enquiries as e")
    .join("sale_listings as l", "l.id", "e.sale_listing_id")
    .join("users as u", "u.id", "e.buyer_user_id")
    .where("l.seller_user_id", userId);
  if (query.status === "open") base = base.whereIn("e.status", ["new", "replied"]);
  if (query.listing_id) base = base.where("e.sale_listing_id", query.listing_id);

  const rows = (await applyCursor(
    base.select("e.*", "u.full_name as buyer_name", "l.ref as l_ref", "l.year as l_year", "l.make as l_make", "l.model as l_model"),
    {
      sortColumn: "e.created_at",
      idColumn: "e.id",
      direction: "desc",
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    },
  )) as unknown as Array<SaleEnquiryRow & { buyer_name: string | null; l_ref: string | null; l_year: number; l_make: string; l_model: string }>;
  const paged = toPaginatedResult(rows, query.limit, "created_at");
  return {
    data: paged.data.map((e) =>
      serializeEnquiryForSeller(e, { id: e.sale_listing_id, ref: e.l_ref, year: e.l_year, make: e.l_make, model: e.l_model }),
    ),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
  };
}

async function requireOwnEnquiry(userId: string, enquiryId: string) {
  const enquiry = await db<SaleEnquiryRow>("sale_enquiries").where({ id: enquiryId }).first();
  if (!enquiry) notFound("enquiry_not_found", "That enquiry isn't yours to answer.");
  const listing = await db<SaleListingRow>("sale_listings").where({ id: enquiry.sale_listing_id, seller_user_id: userId }).first();
  if (!listing) notFound("enquiry_not_found", "That enquiry isn't yours to answer.");
  return { enquiry, listing };
}

/**
 * The seller answers, and chooses whether to hand over their number. The
 * number is never public; this is the only way a buyer gets it (besides the
 * listing's own "share automatically" switch, applied when the enquiry is
 * made).
 */
export async function replyToEnquiry(userId: string, enquiryId: string, input: ReplyEnquiryInput, ctx: RequestContext) {
  const seller = await loadSeller(userId);
  const { enquiry, listing } = await requireOwnEnquiry(userId, enquiryId);
  if (enquiry.status === "closed") conflict("enquiry_closed", "This enquiry is closed.");
  if (!input.share_phone && !input.message?.trim()) invalid("reply_empty", "Write a reply, or share your number.");
  if (input.share_phone && (!seller.user.phone || !seller.user.phone_verified)) {
    invalid("phone_unverified", "Verify your phone number before sharing it.");
  }

  const now = new Date();
  const sharedPhone = input.share_phone ? seller.user.phone : enquiry.shared_phone;
  const notificationIds: string[] = [];
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<SaleEnquiryRow>("sale_enquiries")
      .where({ id: enquiry.id })
      .update({
        status: "replied",
        reply: input.message?.trim() || enquiry.reply,
        shared_phone: sharedPhone,
        contact_shared_at: input.share_phone ? (enquiry.contact_shared_at ?? now) : enquiry.contact_shared_at,
        replied_at: now,
      })
      .returning("*");
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "sale_enquiry.replied",
      entityType: "sale_enquiry",
      entityId: enquiry.id,
      after: { shared_phone: input.share_phone },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    const name = sellerDisplayName(seller.user, seller.merchant);
    const parts = [input.message?.trim(), input.share_phone && sharedPhone ? `Call or text ${name} on ${sharedPhone}.` : null].filter(Boolean);
    notificationIds.push(
      await notify(trx, {
        userId: enquiry.buyer_user_id,
        category: "enquiry",
        title: `${name} replied about the ${title(listing)}`,
        body: `${parts.join(" ")} Never pay anything before you have seen the car and the logbook in person.`,
        ref: listing.ref,
        subjectType: "sale_listing",
        subjectId: listing.id,
      }),
    );
    return row!;
  });
  await enqueueRenterNotificationDelivery(notificationIds);
  return serializeEnquiryForSeller({ ...updated, buyer_name: null }, listing);
}

export async function closeEnquiry(userId: string, enquiryId: string, ctx: RequestContext) {
  const { enquiry, listing } = await requireOwnEnquiry(userId, enquiryId);
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<SaleEnquiryRow>("sale_enquiries").where({ id: enquiry.id }).update({ status: "closed" }).returning("*");
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "sale_enquiry.closed",
      entityType: "sale_enquiry",
      entityId: enquiry.id,
      before: { status: enquiry.status },
      after: { status: "closed" },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row!;
  });
  return serializeEnquiryForSeller({ ...updated, buyer_name: null }, listing);
}

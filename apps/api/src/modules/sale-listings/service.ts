import { ApiError } from "@cral/types";
import type { Knex } from "knex";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { isUniqueViolation } from "../../lib/pg-errors.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import { getOrCreateMerchant, type RequestContext } from "../merchant/service.js";
import type { MerchantRow } from "../merchant/db-types.js";
import {
  MAX_SALE_PHOTOS,
  MIN_SALE_PHOTOS,
  REVIEWED_FIELDS,
  type CreateSaleListingInput,
  type ListSaleListingsQuery,
  type SaleFileKind,
  type SaleStatus,
  type SetSaleStatusInput,
  type UpdateSaleListingInput,
} from "./schemas.js";

/**
 * Cars a merchant lists for sale (Phase 6 CS1 - docs/decisions/car-sales.md,
 * openapi/merchant-sales.yaml). Shaped like an outlet: a draft the merchant
 * builds, photos and the logbook, submit, an Ops decision (CS2), then
 * live / paused, and finally sold or withdrawn.
 *
 * Every status change is a conditional update on the status read, so two
 * requests racing can't both win; each writes `audit_log` in the same
 * transaction.
 */

export interface SaleListingRow {
  id: string;
  merchant_id: string;
  ref: string;
  body_type: string;
  make: string;
  model: string;
  year: number;
  registration: string;
  mileage_km: number;
  transmission: string;
  fuel: string;
  engine_cc: number | null;
  colour: string | null;
  import_status: string;
  accident_history: string;
  known_faults: string;
  encumbered: boolean;
  /** bigint: pg hands it back as a string. */
  asking_price_amount: string | number;
  asking_price_currency: string;
  negotiable: boolean;
  county: string;
  viewing_area: string;
  description: string | null;
  status: SaleStatus;
  reviewer_note: string | null;
  review_assignee: string | null;
  submitted_at: Date | null;
  decided_at: Date | null;
  live_at: Date | null;
  sold_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SaleListingFileRow {
  id: string;
  sale_listing_id: string;
  merchant_id: string;
  kind: SaleFileKind;
  storage_key: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  created_at: Date;
  updated_at: Date;
}

let storageAdapter: ReturnType<typeof createStorageAdapter> | null = null;
export function saleStorage(): ReturnType<typeof createStorageAdapter> {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

/** Every field, the files included, can change only here. */
const FULLY_EDITABLE: SaleStatus[] = ["draft", "action", "rejected"];
/** Price, negotiable, viewing area and description can also change here. */
const OPEN_EDITABLE: SaleStatus[] = ["live", "paused"];
const SUBMITTABLE: SaleStatus[] = ["draft", "action", "rejected"];
const FINAL: SaleStatus[] = ["sold", "withdrawn"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const LOGBOOK_TYPES = [...IMAGE_TYPES, "application/pdf"];
export const REGISTRATION_OPEN_INDEX = "sale_listings_registration_open_unique";

/** Merchant-driven moves: target -> the statuses it can come from. */
const MOVES: Record<SetSaleStatusInput["to"], SaleStatus[]> = {
  paused: ["live"],
  live: ["paused"],
  sold: ["live", "paused"],
  withdrawn: ["pending", "review", "action", "rejected", "live", "paused"],
};

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * `S-YYMMDD-NNN`: Nairobi day plus a sequence that restarts daily, the
 * same shape as `nextBookingRef` (`CB-`) and `nextListingRef` (`H-`).
 * Bumped atomically inside the caller's transaction.
 */
export async function nextSaleRef(trx: Knex.Transaction | Knex): Promise<string> {
  const result = await trx.raw<{ rows: { day: string; n: number }[] }>(
    `INSERT INTO sale_ref_daily_counters (day, n, created_at, updated_at)
     VALUES ((now() AT TIME ZONE 'Africa/Nairobi')::date, 1, now(), now())
     ON CONFLICT (day)
     DO UPDATE SET n = sale_ref_daily_counters.n + 1, updated_at = now()
     RETURNING to_char(day, 'YYMMDD') AS day, n`,
  );
  const { day, n } = result.rows[0]!;
  return `S-${day}-${String(n).padStart(3, "0")}`;
}

export async function saleFiles(listingIds: string[]): Promise<Map<string, SaleListingFileRow[]>> {
  const out = new Map<string, SaleListingFileRow[]>(listingIds.map((id) => [id, []]));
  if (!listingIds.length) return out;
  const rows = await db<SaleListingFileRow>("sale_listing_files")
    .whereIn("sale_listing_id", listingIds)
    .orderBy("created_at", "asc");
  for (const r of rows) out.get(r.sale_listing_id)?.push(r);
  return out;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const fileOut = (f: SaleListingFileRow) => ({
  id: f.id,
  kind: f.kind,
  original_name: f.original_name,
  created_at: f.created_at.toISOString(),
});

export function serializeSaleListing(l: SaleListingRow, files: SaleListingFileRow[]) {
  const logbook = files.find((f) => f.kind === "logbook");
  return {
    id: l.id,
    ref: l.ref,
    status: l.status,
    body_type: l.body_type,
    make: l.make,
    model: l.model,
    year: l.year,
    registration: l.registration,
    mileage_km: l.mileage_km,
    transmission: l.transmission,
    fuel: l.fuel,
    engine_cc: l.engine_cc,
    colour: l.colour,
    import_status: l.import_status,
    accident_history: l.accident_history,
    known_faults: l.known_faults,
    encumbered: l.encumbered,
    asking_price: { amount: Number(l.asking_price_amount), currency: l.asking_price_currency },
    negotiable: l.negotiable,
    county: l.county,
    viewing_area: l.viewing_area,
    description: l.description,
    reviewer_note: l.reviewer_note,
    photos: files.filter((f) => f.kind === "photo").map(fileOut),
    logbook: logbook ? fileOut(logbook) : null,
    submitted_at: iso(l.submitted_at),
    live_at: iso(l.live_at),
    sold_at: iso(l.sold_at),
    created_at: l.created_at.toISOString(),
  };
}
export type SerializedSaleListing = ReturnType<typeof serializeSaleListing>;

async function serializeOne(l: SaleListingRow): Promise<SerializedSaleListing> {
  const files = await saleFiles([l.id]);
  return serializeSaleListing(l, files.get(l.id) ?? []);
}

async function requireOwn(userId: string, listingId: string): Promise<{ merchant: MerchantRow; listing: SaleListingRow }> {
  const merchant = await getOrCreateMerchant(userId);
  const listing = await db<SaleListingRow>("sale_listings").where({ id: listingId, merchant_id: merchant.id }).first();
  if (!listing) {
    throw new ApiError({ status: 404, type: "not_found", code: "sale_listing_not_found", message: "That listing isn't on your account." });
  }
  return { merchant, listing };
}

function conflict(code: string, message: string): never {
  throw new ApiError({ status: 409, type: "conflict", code, message });
}

function invalid(code: string, message: string, field?: string): never {
  throw new ApiError({ status: 422, type: "validation_error", code, message, ...(field ? { field } : {}) });
}

function rethrowPlate(err: unknown): never {
  if (isUniqueViolation(err, REGISTRATION_OPEN_INDEX)) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "registration_already_listed",
      message: "This car is already listed for sale. Withdraw the other listing first.",
      field: "registration",
    });
  }
  throw err;
}

async function audit(
  trx: Knex.Transaction,
  userId: string,
  action: string,
  listingId: string,
  ctx: RequestContext,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): Promise<void> {
  await writeAuditEntry(trx, {
    actorId: userId,
    actorType: "user",
    action,
    entityType: "sale_listing",
    entityId: listingId,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    requestId: ctx.requestId,
    ip: ctx.ip,
  });
}

async function countFiles(listingId: string, kind: SaleFileKind): Promise<number> {
  const [row] = await db("sale_listing_files").where({ sale_listing_id: listingId, kind }).count<{ count: string }[]>("* as count");
  return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------

export async function listSaleListings(userId: string, query: ListSaleListingsQuery) {
  const merchant = await getOrCreateMerchant(userId);
  const statuses = await db<SaleListingRow>("sale_listings").where({ merchant_id: merchant.id }).select("status");
  const counts = { all: statuses.length, needs_action: 0, live: 0 };
  for (const { status } of statuses) {
    if (status === "action" || status === "rejected") counts.needs_action++;
    if (status === "live") counts.live++;
  }
  const rows = await applyCursor(db<SaleListingRow>("sale_listings").where({ merchant_id: merchant.id }).select("*"), {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const paged = toPaginatedResult(rows as SaleListingRow[], query.limit, "created_at");
  const files = await saleFiles(paged.data.map((l) => l.id));
  return {
    data: paged.data.map((l) => serializeSaleListing(l, files.get(l.id) ?? [])),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
    counts,
  };
}

export async function getSaleListing(userId: string, listingId: string) {
  const { listing } = await requireOwn(userId, listingId);
  return serializeOne(listing);
}

// ---------------------------------------------------------------------
// Create / edit / delete
// ---------------------------------------------------------------------

function columnsFrom(input: UpdateSaleListingInput): Partial<SaleListingRow> {
  const { asking_price, ...rest } = input;
  const out: Partial<SaleListingRow> = { ...(rest as Partial<SaleListingRow>) };
  if (asking_price) {
    out.asking_price_amount = asking_price.amount;
    out.asking_price_currency = asking_price.currency;
  }
  return out;
}

export async function createSaleListing(userId: string, input: CreateSaleListingInput, ctx: RequestContext) {
  const merchant = await getOrCreateMerchant(userId);
  const listing = await db
    .transaction(async (trx) => {
      const [row] = await trx<SaleListingRow>("sale_listings")
        .insert({
          id: generateId("saleListing"),
          merchant_id: merchant.id,
          ref: await nextSaleRef(trx),
          ...columnsFrom(input),
          negotiable: input.negotiable ?? true,
          status: "draft",
        })
        .returning("*");
      if (!row) throw new Error("Failed to create sale listing");
      await audit(trx, userId, "sale_listing.created", row.id, ctx, undefined, {
        ref: row.ref,
        registration: row.registration,
        asking_price_amount: Number(row.asking_price_amount),
      });
      return row;
    })
    .catch(rethrowPlate);
  return serializeOne(listing);
}

export async function updateSaleListing(userId: string, listingId: string, input: UpdateSaleListingInput, ctx: RequestContext) {
  const { listing } = await requireOwn(userId, listingId);
  const update = columnsFrom(input);
  const keys = (Object.keys(update) as (keyof SaleListingRow)[]).filter((k) => {
    const v = update[k];
    const cur = k === "asking_price_amount" ? Number(listing[k]) : listing[k];
    return v !== cur;
  });
  if (keys.length === 0) return serializeOne(listing);

  if (!FULLY_EDITABLE.includes(listing.status)) {
    const touchesReviewed = keys.some((k) => (REVIEWED_FIELDS as string[]).includes(k));
    if (!OPEN_EDITABLE.includes(listing.status) || touchesReviewed) {
      conflict(
        "sale_listing_locked",
        OPEN_EDITABLE.includes(listing.status)
          ? "CRAL checked these details against the logbook, so they can't change on a live listing. Withdraw it and list the car again if they're wrong."
          : "This listing can't change right now.",
      );
    }
  }

  const changes = Object.fromEntries(keys.map((k) => [k, update[k]])) as Partial<SaleListingRow>;
  const updated = await db
    .transaction(async (trx) => {
      const [row] = await trx<SaleListingRow>("sale_listings")
        .where({ id: listing.id, status: listing.status })
        .update({ ...changes, updated_at: new Date() })
        .returning("*");
      if (!row) conflict("sale_listing_changed", "This listing changed while you were saving. Reload and try again.");
      await audit(
        trx,
        userId,
        "sale_listing.updated",
        listing.id,
        ctx,
        Object.fromEntries(keys.map((k) => [k, listing[k]])),
        changes as Record<string, unknown>,
      );
      return row;
    })
    .catch(rethrowPlate);
  return serializeOne(updated);
}

export async function deleteSaleListing(userId: string, listingId: string, ctx: RequestContext) {
  const { listing } = await requireOwn(userId, listingId);
  if (listing.status !== "draft") {
    conflict("sale_listing_not_draft", "Only a draft can be deleted. Withdraw this listing instead.");
  }
  const files = await db<SaleListingFileRow>("sale_listing_files").where({ sale_listing_id: listing.id }).select("storage_key");
  await db.transaction(async (trx) => {
    const n = await trx("sale_listings").where({ id: listing.id, status: "draft" }).delete();
    if (!n) conflict("sale_listing_not_draft", "This listing changed. Reload and try again.");
    await audit(trx, userId, "sale_listing.deleted", listing.id, ctx, { ref: listing.ref, status: listing.status });
  });
  for (const f of files) await saleStorage().deleteObject(f.storage_key).catch(() => undefined);
}

// ---------------------------------------------------------------------
// Photos and logbook
// ---------------------------------------------------------------------

export interface SaleFileInput {
  kind: SaleFileKind;
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
}

function assertFilesEditable(listing: SaleListingRow): void {
  if (!FULLY_EDITABLE.includes(listing.status)) {
    conflict("sale_listing_locked", "Photos and the logbook can't change while CRAL has this listing or once it's approved.");
  }
}

export async function uploadSaleFile(userId: string, listingId: string, input: SaleFileInput, ctx: RequestContext) {
  const { merchant, listing } = await requireOwn(userId, listingId);
  assertFilesEditable(listing);
  if (input.kind === "photo") {
    if (!IMAGE_TYPES.includes(input.file.mimetype)) invalid("photo_must_be_image", "Photos must be JPEG, PNG or WebP.", "file");
    if ((await countFiles(listing.id, "photo")) >= MAX_SALE_PHOTOS) {
      invalid("too_many_photos", `Up to ${MAX_SALE_PHOTOS} photos. Remove one to add another.`, "file");
    }
  } else if (!LOGBOOK_TYPES.includes(input.file.mimetype)) {
    invalid("logbook_type", "Upload the logbook as a PDF, JPEG, PNG or WebP.", "file");
  }

  const fileId = generateId("saleListingFile");
  const safeName = input.file.originalname.replace(/[^A-Za-z0-9_.-]/g, "_").slice(-100);
  const key = `merchant/${merchant.id}/sale-listings/${listing.id}/${fileId}-${safeName}`;
  await saleStorage().putObject({ key, body: input.file.buffer, contentType: input.file.mimetype });

  // A new logbook replaces the old one.
  const replaced =
    input.kind === "logbook"
      ? await db<SaleListingFileRow>("sale_listing_files").where({ sale_listing_id: listing.id, kind: "logbook" }).select("*")
      : [];
  try {
    await db.transaction(async (trx) => {
      if (replaced.length) await trx("sale_listing_files").whereIn("id", replaced.map((r) => r.id)).delete();
      await trx<SaleListingFileRow>("sale_listing_files").insert({
        id: fileId,
        sale_listing_id: listing.id,
        merchant_id: merchant.id,
        kind: input.kind,
        storage_key: key,
        original_name: input.file.originalname,
        content_type: input.file.mimetype,
        size_bytes: input.file.size,
      });
      await audit(trx, userId, `sale_listing.${input.kind}_added`, listing.id, ctx, undefined, {
        file_id: fileId,
        original_name: input.file.originalname,
      });
    });
  } catch (err) {
    await saleStorage().deleteObject(key).catch(() => undefined);
    throw err;
  }
  for (const r of replaced) await saleStorage().deleteObject(r.storage_key).catch(() => undefined);
  return serializeOne(listing);
}

export async function deleteSaleFile(userId: string, listingId: string, fileId: string, ctx: RequestContext) {
  const { listing } = await requireOwn(userId, listingId);
  const file = await db<SaleListingFileRow>("sale_listing_files").where({ id: fileId, sale_listing_id: listing.id }).first();
  if (!file) throw new ApiError({ status: 404, type: "not_found", code: "file_not_found", message: "That file isn't on this listing." });
  assertFilesEditable(listing);
  await db.transaction(async (trx) => {
    await trx("sale_listing_files").where({ id: file.id }).delete();
    await audit(trx, userId, `sale_listing.${file.kind}_removed`, listing.id, ctx, { file_id: file.id });
  });
  await saleStorage().deleteObject(file.storage_key).catch(() => undefined);
  return serializeOne(listing);
}

/** Bytes of one file; `merchantId` scopes it to the owner (the Ops case reads without it, CS2). */
export async function readSaleFile(listingId: string, fileId: string, merchantId?: string) {
  const q = db<SaleListingFileRow>("sale_listing_files").where({ id: fileId, sale_listing_id: listingId });
  if (merchantId) q.andWhere({ merchant_id: merchantId });
  const file = await q.first();
  if (!file) throw new ApiError({ status: 404, type: "not_found", code: "file_not_found", message: "That file isn't on this listing." });
  const body = await saleStorage()
    .getObject(file.storage_key)
    .catch(() => {
      throw new ApiError({ status: 404, type: "not_found", code: "file_bytes_missing", message: "That file is no longer stored." });
    });
  return { body, contentType: file.content_type, originalName: file.original_name };
}

export async function readOwnSaleFile(userId: string, listingId: string, fileId: string) {
  const { merchant } = await requireOwn(userId, listingId);
  return readSaleFile(listingId, fileId, merchant.id);
}

// ---------------------------------------------------------------------
// Submit / status
// ---------------------------------------------------------------------

export async function submitSaleListing(userId: string, listingId: string, ctx: RequestContext) {
  const { listing } = await requireOwn(userId, listingId);
  if (!SUBMITTABLE.includes(listing.status)) {
    conflict("sale_listing_not_submittable", "This listing is already with CRAL, approved or closed.");
  }
  if ((await countFiles(listing.id, "photo")) < MIN_SALE_PHOTOS) {
    invalid("photos_required", `Add at least ${MIN_SALE_PHOTOS} photos: front, back, both sides and the inside help buyers most.`);
  }
  if ((await countFiles(listing.id, "logbook")) === 0) {
    invalid("logbook_required", "Upload the logbook. CRAL checks it before the car goes live.");
  }

  // A reviewer who already has it gets it straight back; otherwise it joins the queue.
  const next: SaleStatus = listing.status !== "draft" && listing.review_assignee ? "review" : "pending";
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<SaleListingRow>("sale_listings")
      .where({ id: listing.id, status: listing.status })
      .update({ status: next, submitted_at: new Date(), updated_at: new Date() })
      .returning("*");
    if (!row) conflict("sale_listing_not_submittable", "This listing changed while you were sending it. Reload and try again.");
    await audit(trx, userId, "sale_listing.submitted", listing.id, ctx, { status: listing.status }, { status: next });
    return row;
  });
  return serializeOne(updated);
}

export async function setSaleStatus(userId: string, listingId: string, input: SetSaleStatusInput, ctx: RequestContext) {
  const { listing } = await requireOwn(userId, listingId);
  const from = listing.status;
  if (FINAL.includes(from) || !MOVES[input.to].includes(from)) {
    conflict("invalid_transition", `A ${from} listing can't be marked ${input.to}.`);
  }
  const now = new Date();
  const patch: Partial<SaleListingRow> = { status: input.to, updated_at: now };
  if (input.to === "sold") patch.sold_at = now;
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<SaleListingRow>("sale_listings").where({ id: listing.id, status: from }).update(patch).returning("*");
    if (!row) conflict("sale_listing_changed", "This listing changed. Reload and try again.");
    await audit(trx, userId, `sale_listing.${input.to}`, listing.id, ctx, { status: from }, { status: input.to });
    return row;
  });
  return serializeOne(updated);
}

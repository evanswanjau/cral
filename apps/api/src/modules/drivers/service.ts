import { ApiError, kes, type Money } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { rethrowDriverConflict } from "../../lib/pg-errors.js";
import { assertNotPast, nairobiDayKey } from "../../lib/dates.js";
import { normalizePhone } from "../../lib/identifier.js";
import { notify } from "../../lib/notifications.js";
import { enqueueNotificationDelivery } from "../../jobs/notification-delivery.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import { getOrCreateMerchant, type RequestContext } from "../merchant/service.js";
import { effectiveDocState } from "../vehicles/service.js";
import type { DocumentRow, DriverRow, DriverStatus, MerchantRow } from "../merchant/db-types.js";
import {
  DRIVER_DOCUMENT_KINDS,
  type CreateDriverInput,
  type DriverDocumentKind,
  type ListDriversQuery,
  type UpdateDriverInput,
} from "./schemas.js";

/**
 * Drivers a merchant lists for hire (owner's call, 2026-10-18 -
 * docs/plans/drivers.md, openapi/merchant-drivers.yaml).
 *
 * Shaped like the vehicle listing on purpose: a draft the merchant builds,
 * three documents, submit, an Ops decision, then live / paused. A driver
 * belongs to exactly one merchant - the unique indexes on the normalised
 * national ID and licence number are what make that true under
 * concurrency, `rethrowDriverConflict` only gives it a clean error.
 */

let storageAdapter: ReturnType<typeof createStorageAdapter> | null = null;
function getStorageAdapter(): ReturnType<typeof createStorageAdapter> {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

/** Identity fields are locked once a reviewer has them, same rule as a vehicle's logbook details. */
const EDITABLE_STATUSES: DriverStatus[] = ["draft", "action", "rejected"];

export const DOC_LABELS: Record<DriverDocumentKind, string> = {
  driving_licence: "Driving licence",
  national_id: "National ID",
  kra_pin: "KRA PIN certificate",
};

/** The account holder's ID and KRA PIN are the account's own documents. */
const ACCOUNT_KINDS: DriverDocumentKind[] = ["national_id", "kra_pin"];

// ---------------------------------------------------------------------
// Shared helpers - also used by the admin review and the catalog
// ---------------------------------------------------------------------

export function licenceExpiryKey(driver: Pick<DriverRow, "licence_expiry">): string {
  const v = driver.licence_expiry;
  return typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);
}

/** Expired once the expiry day is behind today in Nairobi - derived, never stored. */
export function isLicenceExpired(driver: Pick<DriverRow, "licence_expiry">): boolean {
  return licenceExpiryKey(driver) < nairobiDayKey(new Date());
}

export function driverRates(driver: DriverRow): { day: Money | null; hour: Money | null; trip: Money | null } {
  return {
    day: driver.daily_rate_amount ? kes(driver.daily_rate_amount) : null,
    hour: driver.hourly_rate_amount ? kes(driver.hourly_rate_amount) : null,
    trip: driver.trip_rate_amount ? kes(driver.trip_rate_amount) : null,
  };
}

/**
 * The documents that stand for each of a driver's three kinds: the
 * driver's own rows, or - for the account holder's ID and KRA PIN - the
 * account-level rows (no vehicle, no driver).
 */
export async function driverDocuments(
  drivers: DriverRow[],
): Promise<Map<string, Record<DriverDocumentKind, (DocumentRow & { from_account: boolean }) | undefined>>> {
  const out = new Map<string, Record<DriverDocumentKind, (DocumentRow & { from_account: boolean }) | undefined>>();
  if (!drivers.length) return out;

  const own = await db<DocumentRow>("documents").whereIn(
    "driver_id",
    drivers.map((d) => d.id),
  );
  const holderMerchantIds = [...new Set(drivers.filter((d) => d.is_account_holder).map((d) => d.merchant_id))];
  const account = holderMerchantIds.length
    ? await db<DocumentRow>("documents")
        .whereIn("merchant_id", holderMerchantIds)
        .whereNull("vehicle_id")
        .whereNull("driver_id")
        .whereIn("kind", ACCOUNT_KINDS)
    : [];

  for (const d of drivers) {
    const slots = {} as Record<DriverDocumentKind, (DocumentRow & { from_account: boolean }) | undefined>;
    for (const kind of DRIVER_DOCUMENT_KINDS) {
      if (d.is_account_holder && ACCOUNT_KINDS.includes(kind)) {
        const row = account.find((a) => a.merchant_id === d.merchant_id && a.kind === kind);
        slots[kind] = row ? { ...row, from_account: true } : undefined;
      } else {
        const row = own.find((o) => o.driver_id === d.id && o.kind === kind);
        slots[kind] = row ? { ...row, from_account: false } : undefined;
      }
    }
    out.set(d.id, slots);
  }
  return out;
}

function slot(doc: (DocumentRow & { from_account: boolean }) | undefined) {
  if (!doc) return null;
  return {
    document_id: doc.id,
    original_name: doc.original_name,
    review_state: effectiveDocState(doc),
    review_note: doc.review_note,
    expires_at: doc.expires_at,
    from_account: doc.from_account,
  };
}

function serialize(driver: DriverRow, docs: Record<DriverDocumentKind, (DocumentRow & { from_account: boolean }) | undefined>) {
  const documents = {
    driving_licence: slot(docs.driving_licence),
    national_id: slot(docs.national_id),
    kra_pin: slot(docs.kra_pin),
  };
  return {
    id: driver.id,
    full_name: driver.full_name,
    phone: driver.phone,
    national_id: driver.national_id,
    kra_pin: driver.kra_pin,
    licence_number: driver.licence_number,
    licence_expiry: licenceExpiryKey(driver),
    licence_expired: isLicenceExpired(driver),
    county: driver.county,
    is_account_holder: driver.is_account_holder,
    rates: driverRates(driver),
    status: driver.status,
    reviewer_note: driver.reviewer_note,
    documents,
    doc_count: Object.values(documents).filter((d) => d && d.review_state !== "rejected").length,
    submitted_at: driver.submitted_at ? driver.submitted_at.toISOString() : null,
    created_at: driver.created_at.toISOString(),
  };
}
export type SerializedDriver = ReturnType<typeof serialize>;

async function serializeOne(driver: DriverRow): Promise<SerializedDriver> {
  const docs = await driverDocuments([driver]);
  return serialize(driver, docs.get(driver.id)!);
}

async function requireOwnDriver(userId: string, driverId: string): Promise<{ merchant: MerchantRow; driver: DriverRow }> {
  const merchant = await getOrCreateMerchant(userId);
  const driver = await db<DriverRow>("drivers").where({ id: driverId, merchant_id: merchant.id }).first();
  if (!driver) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "driver_not_found",
      message: "That driver isn't on your account.",
    });
  }
  return { merchant, driver };
}

function rateCents(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

function phoneOrThrow(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "invalid_phone",
      message: "Enter a Kenyan mobile number, like 0712 345 678.",
      field: "phone",
    });
  }
  return phone;
}

function conflict(code: string, message: string): never {
  throw new ApiError({ status: 409, type: "conflict", code, message });
}

// ---------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------

export async function listDrivers(userId: string, query: ListDriversQuery) {
  const merchant = await getOrCreateMerchant(userId);

  const statuses = await db<DriverRow>("drivers").where({ merchant_id: merchant.id }).select("status");
  const counts = { all: statuses.length, needs_action: 0, live: 0 };
  for (const { status } of statuses) {
    if (status === "action" || status === "rejected") counts.needs_action++;
    if (status === "live") counts.live++;
  }

  const rows = await applyCursor(db<DriverRow>("drivers").where({ merchant_id: merchant.id }).select("*"), {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const paged = toPaginatedResult(rows as DriverRow[], query.limit, "created_at");
  const docs = await driverDocuments(paged.data);

  return {
    data: paged.data.map((d) => serialize(d, docs.get(d.id)!)),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
    counts,
  };
}

export async function getDriver(userId: string, driverId: string) {
  const { driver } = await requireOwnDriver(userId, driverId);
  return serializeOne(driver);
}

// ---------------------------------------------------------------------
// Create / edit / delete
// ---------------------------------------------------------------------

export async function createDriver(userId: string, input: CreateDriverInput, ctx: RequestContext) {
  const merchant = await getOrCreateMerchant(userId);
  assertNotPast(input.licence_expiry, "licence_expiry");
  const phone = phoneOrThrow(input.phone);

  const isHolder = input.is_account_holder === true;
  if (isHolder) {
    const existing = await db<DriverRow>("drivers").where({ merchant_id: merchant.id, is_account_holder: true }).first();
    if (existing) conflict("account_holder_exists", "You've already added yourself as a driver.");
  }

  const driver = await db
    .transaction(async (trx) => {
      const [row] = await trx<DriverRow>("drivers")
        .insert({
          id: generateId("driver"),
          merchant_id: merchant.id,
          full_name: input.full_name,
          phone,
          national_id: input.national_id,
          kra_pin: input.kra_pin.toUpperCase(),
          licence_number: input.licence_number.toUpperCase(),
          licence_expiry: input.licence_expiry,
          county: input.county,
          is_account_holder: isHolder,
          daily_rate_amount: rateCents(input.daily_rate) ?? null,
          hourly_rate_amount: rateCents(input.hourly_rate) ?? null,
          trip_rate_amount: rateCents(input.trip_rate) ?? null,
          status: "draft",
        })
        .returning("*");
      if (!row) throw new Error("Failed to create driver");
      await writeAuditEntry(trx, {
        actorId: userId,
        actorType: "user",
        action: "driver.created",
        entityType: "driver",
        entityId: row.id,
        after: { full_name: row.full_name, status: row.status },
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
      return row;
    })
    .catch(rethrowDriverConflict);

  return serializeOne(driver);
}

export async function updateDriver(userId: string, driverId: string, input: UpdateDriverInput, ctx: RequestContext) {
  const { driver } = await requireOwnDriver(userId, driverId);

  const identityTouched = (
    ["full_name", "phone", "national_id", "kra_pin", "licence_number", "licence_expiry"] as const
  ).some((k) => input[k] !== undefined);
  if (identityTouched && !EDITABLE_STATUSES.includes(driver.status)) {
    conflict(
      "driver_locked",
      "A reviewer has these details. Message support to change them, or wait until the driver is sent back.",
    );
  }

  const update: Partial<DriverRow> = {};
  if (input.full_name !== undefined) update.full_name = input.full_name;
  if (input.phone !== undefined) update.phone = phoneOrThrow(input.phone);
  if (input.national_id !== undefined) update.national_id = input.national_id;
  if (input.kra_pin !== undefined) update.kra_pin = input.kra_pin.toUpperCase();
  if (input.licence_number !== undefined) update.licence_number = input.licence_number.toUpperCase();
  if (input.licence_expiry !== undefined) {
    assertNotPast(input.licence_expiry, "licence_expiry");
    update.licence_expiry = input.licence_expiry;
  }
  if (input.county !== undefined) update.county = input.county;
  const day = rateCents(input.daily_rate);
  const hour = rateCents(input.hourly_rate);
  const trip = rateCents(input.trip_rate);
  if (day !== undefined) update.daily_rate_amount = day;
  if (hour !== undefined) update.hourly_rate_amount = hour;
  if (trip !== undefined) update.trip_rate_amount = trip;

  // A live driver can't be left with no way to price a booking.
  const after = { ...driver, ...update };
  if (driver.status !== "draft" && !after.daily_rate_amount && !after.hourly_rate_amount && !after.trip_rate_amount) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "driver_rate_required",
      message: "Keep at least one rate - per day, per hour or per trip.",
    });
  }

  if (Object.keys(update).length === 0) return serializeOne(driver);

  const updated = await db
    .transaction(async (trx) => {
      const [row] = await trx<DriverRow>("drivers").where({ id: driver.id }).update(update).returning("*");
      if (!row) throw new Error("Failed to update driver");
      await writeAuditEntry(trx, {
        actorId: userId,
        actorType: "user",
        action: "driver.updated",
        entityType: "driver",
        entityId: driver.id,
        before: Object.fromEntries(Object.keys(update).map((k) => [k, driver[k as keyof DriverRow]])),
        after: update,
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
      return row;
    })
    .catch(rethrowDriverConflict);

  return serializeOne(updated);
}

export async function deleteDriver(userId: string, driverId: string, ctx: RequestContext) {
  const { driver } = await requireOwnDriver(userId, driverId);
  const booking = await db("bookings").where({ driver_id: driver.id }).first("id");
  if (booking) {
    conflict("driver_has_bookings", "This driver has bookings, so they can't be removed. Pause them instead.");
  }
  const docs = await db<DocumentRow>("documents").where({ driver_id: driver.id }).select("storage_key");
  await db.transaction(async (trx) => {
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "driver.deleted",
      entityType: "driver",
      entityId: driver.id,
      before: { full_name: driver.full_name, status: driver.status },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    // Cascades to the driver's own documents.
    await trx<DriverRow>("drivers").where({ id: driver.id }).delete();
  });
  // Rows first, bytes second - same order as every other document delete.
  for (const d of docs) await getStorageAdapter().deleteObject(d.storage_key).catch(() => undefined);
}

// ---------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------

export interface UploadDriverDocumentInput {
  kind: DriverDocumentKind;
  expiresAt?: string | undefined;
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
}

export async function uploadDriverDocument(
  userId: string,
  driverId: string,
  input: UploadDriverDocumentInput,
  ctx: RequestContext,
) {
  const { merchant, driver } = await requireOwnDriver(userId, driverId);
  if (driver.is_account_holder && ACCOUNT_KINDS.includes(input.kind)) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "account_document",
      message: "Your ID and KRA PIN come from your account documents in Settings.",
      field: "kind",
    });
  }
  if (input.kind === "driving_licence" && input.expiresAt) assertNotPast(input.expiresAt, "expires_at");

  const safeName = input.file.originalname.replace(/[^A-Za-z0-9_.-]/g, "_").slice(-100);
  const key = `merchant/${merchant.id}/drivers/${driver.id}/${input.kind}/${generateId("document")}-${safeName}`;
  await getStorageAdapter().putObject({ key, body: input.file.buffer, contentType: input.file.mimetype });

  let replacedKeys: string[] = [];
  const updated = await db.transaction(async (trx) => {
    const superseded = await trx<DocumentRow>("documents")
      .where({ driver_id: driver.id, kind: input.kind })
      .delete()
      .returning("storage_key");
    replacedKeys = superseded.map((d) => d.storage_key);
    await trx<DocumentRow>("documents").insert({
      id: generateId("document"),
      merchant_id: merchant.id,
      vehicle_id: null,
      driver_id: driver.id,
      kind: input.kind,
      storage_key: key,
      original_name: input.file.originalname,
      size_bytes: input.file.size,
      content_type: input.file.mimetype,
      review_state: "pending",
      expires_at: input.kind === "driving_licence" ? (input.expiresAt ?? licenceExpiryKey(driver)) : null,
    });

    // Same rule as a vehicle re-upload: a sent-back driver goes back in
    // front of the reviewer; a draft, an unopened submission and a live
    // driver stay where they are.
    const patch: Partial<DriverRow> = {};
    if (driver.status === "action" || driver.status === "rejected") patch.status = "review";
    if (input.kind === "driving_licence" && input.expiresAt) patch.licence_expiry = input.expiresAt;
    const [row] = Object.keys(patch).length
      ? await trx<DriverRow>("drivers").where({ id: driver.id }).update(patch).returning("*")
      : [driver];

    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "driver.document_uploaded",
      entityType: "driver",
      entityId: driver.id,
      after: { kind: input.kind, original_name: input.file.originalname },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row as DriverRow;
  });
  for (const k of replacedKeys) await getStorageAdapter().deleteObject(k).catch(() => undefined);

  return serializeOne(updated);
}

// ---------------------------------------------------------------------
// Submit / pause / resume
// ---------------------------------------------------------------------

export async function submitDriver(userId: string, driverId: string, ctx: RequestContext) {
  const { merchant, driver } = await requireOwnDriver(userId, driverId);
  if (driver.status !== "draft") conflict("driver_not_draft", "Only a draft driver can be sent for review.");
  if (!driver.daily_rate_amount && !driver.hourly_rate_amount && !driver.trip_rate_amount) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "driver_rate_required",
      message: "Set at least one rate - per day, per hour or per trip.",
    });
  }
  if (isLicenceExpired(driver)) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "licence_expired",
      message: "This licence has expired. Update the expiry date and upload the current licence.",
      field: "licence_expiry",
    });
  }
  const docs = (await driverDocuments([driver])).get(driver.id)!;
  const missing = DRIVER_DOCUMENT_KINDS.filter((k) => !docs[k] || docs[k]!.review_state === "rejected");
  if (missing.length) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "documents_incomplete",
      message: `Attach the ${missing.map((k) => DOC_LABELS[k].toLowerCase()).join(" and ")} first.`,
    });
  }

  const notificationIds: string[] = [];
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<DriverRow>("drivers")
      .where({ id: driver.id, status: "draft" })
      .update({ status: "pending", submitted_at: new Date() })
      .returning("*");
    if (!row) conflict("driver_not_draft", "Only a draft driver can be sent for review.");
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "driver.submitted",
      entityType: "driver",
      entityId: driver.id,
      after: { status: "pending" },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    notificationIds.push(
      await notify(trx, {
        merchantId: merchant.id,
        category: "review",
        title: `${row.full_name} is in the review queue`,
        body: "Driver documents received. Reviews take up to two working days.",
        ref: row.full_name,
        subjectType: "driver",
        subjectId: row.id,
      }),
    );
    return row;
  });
  await enqueueNotificationDelivery(merchant.id, notificationIds);
  return serializeOne(updated);
}

async function setPause(userId: string, driverId: string, ctx: RequestContext, pausing: boolean) {
  const { driver } = await requireOwnDriver(userId, driverId);
  if (pausing && driver.status !== "live") conflict("not_live", "Only a live driver can be paused.");
  if (!pausing && driver.status !== "paused") conflict("not_paused", "Only a paused driver can take bookings again.");
  const next: DriverStatus = pausing ? "paused" : "live";

  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<DriverRow>("drivers").where({ id: driver.id }).update({ status: next }).returning("*");
    if (!row) throw new Error("Failed to update driver");
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: pausing ? "driver.paused" : "driver.resumed",
      entityType: "driver",
      entityId: driver.id,
      before: { status: driver.status },
      after: { status: next },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });
  return serializeOne(updated);
}

export const pauseDriver = (userId: string, driverId: string, ctx: RequestContext) => setPause(userId, driverId, ctx, true);
export const resumeDriver = (userId: string, driverId: string, ctx: RequestContext) => setPause(userId, driverId, ctx, false);

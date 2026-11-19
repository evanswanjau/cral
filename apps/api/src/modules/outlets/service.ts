import { ApiError } from "@cral/types";
import type { Knex } from "knex";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { notify } from "../../lib/notifications.js";
import { enqueueNotificationDelivery } from "../../jobs/notification-delivery.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import { getOrCreateMerchant, type RequestContext } from "../merchant/service.js";
import type { MerchantRow } from "../merchant/db-types.js";
import {
  MAX_OUTLET_PHOTOS,
  MIN_OUTLET_PHOTOS,
  type CreateOutletInput,
  type ListOutletsQuery,
  type OutletKind,
  type OutletStatus,
  type ServiceType,
  type UpdateOutletInput,
} from "./schemas.js";

/**
 * A merchant's premises (Phase 4 GS1 - docs/decisions/garage.md,
 * openapi/merchant-outlets.yaml). Shaped like a driver: a draft the
 * merchant builds, photos, submit, an Ops decision after a real visit,
 * then live / paused.
 *
 * Name, address and county are what the visit checks, so they lock while
 * Ops has the outlet and once it is approved. Changing them on a draft or
 * a sent-back outlet bumps `details_updated_at`, which makes the
 * reviewer's premises answers (the visit included) stale.
 */

export interface OutletRow {
  id: string;
  merchant_id: string;
  kind: OutletKind;
  name: string;
  address: string;
  county: string;
  phone: string | null;
  opening_hours: string;
  service_types: ServiceType[];
  status: OutletStatus;
  reviewer_note: string | null;
  review_assignee: string | null;
  submitted_at: Date | null;
  decided_at: Date | null;
  details_updated_at: Date;
  visited_on: string | Date | null;
  visited_by: string | null;
  visit_recorded_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OutletPhotoRow {
  id: string;
  outlet_id: string;
  merchant_id: string;
  storage_key: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  created_at: Date;
  updated_at: Date;
}

let storageAdapter: ReturnType<typeof createStorageAdapter> | null = null;
export function outletStorage(): ReturnType<typeof createStorageAdapter> {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

/** Name, address and county are editable only here. */
const DETAIL_EDITABLE: OutletStatus[] = ["draft", "action", "rejected"];
const SUBMITTABLE: OutletStatus[] = ["draft", "action", "rejected"];
/** Statuses that must keep the minimum photo set. */
const KEEPS_PHOTOS: OutletStatus[] = ["pending", "review", "live", "paused"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  service: "Servicing",
  diagnostics: "Diagnostics",
  mechanical: "Mechanical repair",
  bodywork: "Bodywork and paint",
  tyres: "Tyres and alignment",
  electrical: "Electrical",
  ac: "Air conditioning",
};

// ---------------------------------------------------------------------
// Shared helpers - also used by the admin review
// ---------------------------------------------------------------------

export function visitDateKey(v: string | Date | null): string | null {
  if (!v) return null;
  return typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);
}

export async function outletPhotos(outletIds: string[]): Promise<Map<string, OutletPhotoRow[]>> {
  const out = new Map<string, OutletPhotoRow[]>(outletIds.map((id) => [id, []]));
  if (!outletIds.length) return out;
  const rows = await db<OutletPhotoRow>("outlet_photos").whereIn("outlet_id", outletIds).orderBy("created_at", "asc");
  for (const r of rows) out.get(r.outlet_id)?.push(r);
  return out;
}

function serialize(outlet: OutletRow, photos: OutletPhotoRow[]) {
  return {
    id: outlet.id,
    kind: outlet.kind,
    name: outlet.name,
    address: outlet.address,
    county: outlet.county,
    phone: outlet.phone,
    opening_hours: outlet.opening_hours,
    service_types: outlet.service_types ?? [],
    status: outlet.status,
    reviewer_note: outlet.reviewer_note,
    // Backed by a reviewer's recorded visit, never set any other way.
    visited: outlet.visited_on !== null && outlet.visited_by !== null,
    visited_on: visitDateKey(outlet.visited_on),
    photos: photos.map((p) => ({ id: p.id, original_name: p.original_name, created_at: p.created_at.toISOString() })),
    submitted_at: outlet.submitted_at ? outlet.submitted_at.toISOString() : null,
    created_at: outlet.created_at.toISOString(),
  };
}
export type SerializedOutlet = ReturnType<typeof serialize>;

async function serializeOne(outlet: OutletRow): Promise<SerializedOutlet> {
  const photos = await outletPhotos([outlet.id]);
  return serialize(outlet, photos.get(outlet.id) ?? []);
}

async function requireOwnOutlet(userId: string, outletId: string): Promise<{ merchant: MerchantRow; outlet: OutletRow }> {
  const merchant = await getOrCreateMerchant(userId);
  const outlet = await db<OutletRow>("outlets").where({ id: outletId, merchant_id: merchant.id }).first();
  if (!outlet) {
    throw new ApiError({ status: 404, type: "not_found", code: "outlet_not_found", message: "Those premises aren't on your account." });
  }
  return { merchant, outlet };
}

function conflict(code: string, message: string): never {
  throw new ApiError({ status: 409, type: "conflict", code, message });
}

function invalid(code: string, message: string, field?: string): never {
  throw new ApiError({ status: 422, type: "validation_error", code, message, ...(field ? { field } : {}) });
}

async function audit(
  trx: Knex.Transaction,
  userId: string,
  action: string,
  outletId: string,
  ctx: RequestContext,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): Promise<void> {
  await writeAuditEntry(trx, {
    actorId: userId,
    actorType: "user",
    action,
    entityType: "outlet",
    entityId: outletId,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    requestId: ctx.requestId,
    ip: ctx.ip,
  });
}

// ---------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------

export async function listOutlets(userId: string, query: ListOutletsQuery) {
  const merchant = await getOrCreateMerchant(userId);
  const statuses = await db<OutletRow>("outlets").where({ merchant_id: merchant.id }).select("status");
  const counts = { all: statuses.length, needs_action: 0, live: 0 };
  for (const { status } of statuses) {
    if (status === "action" || status === "rejected") counts.needs_action++;
    if (status === "live") counts.live++;
  }

  const rows = await applyCursor(db<OutletRow>("outlets").where({ merchant_id: merchant.id }).select("*"), {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const paged = toPaginatedResult(rows as OutletRow[], query.limit, "created_at");
  const photos = await outletPhotos(paged.data.map((o) => o.id));
  return {
    data: paged.data.map((o) => serialize(o, photos.get(o.id) ?? [])),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
    counts,
  };
}

export async function getOutlet(userId: string, outletId: string) {
  const { outlet } = await requireOwnOutlet(userId, outletId);
  return serializeOne(outlet);
}

// ---------------------------------------------------------------------
// Create / edit / delete
// ---------------------------------------------------------------------

export async function createOutlet(userId: string, input: CreateOutletInput, ctx: RequestContext) {
  const merchant = await getOrCreateMerchant(userId);
  const outlet = await db.transaction(async (trx) => {
    const [row] = await trx<OutletRow>("outlets")
      .insert({
        id: generateId("outlet"),
        merchant_id: merchant.id,
        kind: input.kind,
        name: input.name,
        address: input.address,
        county: input.county,
        phone: input.phone ?? null,
        opening_hours: input.opening_hours,
        // Service types are a garage's; a parts dealer has none (PT1).
        service_types: input.kind === "garage" ? [...new Set(input.service_types ?? [])] : [],
        status: "draft",
      })
      .returning("*");
    if (!row) throw new Error("Failed to create outlet");
    await audit(trx, userId, "outlet.created", row.id, ctx, undefined, { kind: row.kind, name: row.name, county: row.county });
    return row;
  });
  return serializeOne(outlet);
}

export async function updateOutlet(userId: string, outletId: string, input: UpdateOutletInput, ctx: RequestContext) {
  const { outlet } = await requireOwnOutlet(userId, outletId);

  const update: Partial<OutletRow> = {};
  const detailChanged =
    (input.name !== undefined && input.name !== outlet.name) ||
    (input.address !== undefined && input.address !== outlet.address) ||
    (input.county !== undefined && input.county !== outlet.county);
  if (detailChanged) {
    if (!DETAIL_EDITABLE.includes(outlet.status)) {
      conflict(
        "outlet_locked",
        "CRAL is checking these premises, so the name, address and county can't change now. Message support if they're wrong.",
      );
    }
    if (input.name !== undefined) update.name = input.name;
    if (input.address !== undefined) update.address = input.address;
    if (input.county !== undefined) update.county = input.county;
    update.details_updated_at = new Date();
    // The visit was to the old details: it no longer stands.
    update.visited_on = null;
    update.visited_by = null;
    update.visit_recorded_by = null;
  }
  if (input.phone !== undefined) update.phone = input.phone ?? null;
  if (input.opening_hours !== undefined) update.opening_hours = input.opening_hours;
  if (input.service_types !== undefined && outlet.kind === "garage") {
    const next = [...new Set(input.service_types)];
    if (outlet.kind === "garage" && next.length === 0 && outlet.status !== "draft") {
      invalid("service_types_required", "Keep at least one service.", "service_types");
    }
    update.service_types = next;
  }
  if (Object.keys(update).length === 0) return serializeOne(outlet);

  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<OutletRow>("outlets").where({ id: outlet.id }).update(update).returning("*");
    if (!row) throw new Error("Failed to update outlet");
    const keys = (Object.keys(update) as (keyof OutletRow)[]).filter(
      (k) => !["details_updated_at", "visited_on", "visited_by", "visit_recorded_by"].includes(k),
    );
    await audit(
      trx,
      userId,
      "outlet.updated",
      outlet.id,
      ctx,
      Object.fromEntries(keys.map((k) => [k, outlet[k]])),
      Object.fromEntries(keys.map((k) => [k, update[k]])),
    );
    return row;
  });
  return serializeOne(updated);
}

export async function deleteOutlet(userId: string, outletId: string, ctx: RequestContext) {
  const { outlet } = await requireOwnOutlet(userId, outletId);
  if (outlet.status === "live" || outlet.status === "paused") {
    conflict("outlet_live", "Approved premises can't be removed. Pause them instead.");
  }
  const photos = await db<OutletPhotoRow>("outlet_photos").where({ outlet_id: outlet.id }).select("storage_key");
  await db.transaction(async (trx) => {
    await audit(trx, userId, "outlet.deleted", outlet.id, ctx, { name: outlet.name, status: outlet.status });
    // Cascades to the photos and checklist answers.
    await trx<OutletRow>("outlets").where({ id: outlet.id }).delete();
  });
  // Rows first, bytes second - same order as every other file delete.
  for (const p of photos) await outletStorage().deleteObject(p.storage_key).catch(() => undefined);
}

// ---------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------

export interface OutletPhotoInput {
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
}

export async function uploadOutletPhoto(userId: string, outletId: string, input: OutletPhotoInput, ctx: RequestContext) {
  const { merchant, outlet } = await requireOwnOutlet(userId, outletId);
  if (!IMAGE_TYPES.includes(input.file.mimetype)) {
    invalid("photo_must_be_image", "Photos must be JPEG, PNG or WebP.", "file");
  }
  const existing = Number(
    (await db("outlet_photos").where({ outlet_id: outlet.id }).count<{ count: string }[]>("* as count"))[0]?.count ?? 0,
  );
  if (existing >= MAX_OUTLET_PHOTOS) {
    invalid("too_many_photos", `Up to ${MAX_OUTLET_PHOTOS} photos. Remove one to add another.`, "file");
  }

  const photoId = generateId("outletPhoto");
  const safeName = input.file.originalname.replace(/[^A-Za-z0-9_.-]/g, "_").slice(-100);
  const key = `merchant/${merchant.id}/outlets/${outlet.id}/${photoId}-${safeName}`;
  await outletStorage().putObject({ key, body: input.file.buffer, contentType: input.file.mimetype });

  try {
    await db.transaction(async (trx) => {
      await trx<OutletPhotoRow>("outlet_photos").insert({
        id: photoId,
        outlet_id: outlet.id,
        merchant_id: merchant.id,
        storage_key: key,
        original_name: input.file.originalname,
        content_type: input.file.mimetype,
        size_bytes: input.file.size,
      });
      await audit(trx, userId, "outlet.photo_added", outlet.id, ctx, undefined, { photo_id: photoId, original_name: input.file.originalname });
    });
  } catch (err) {
    await outletStorage().deleteObject(key).catch(() => undefined);
    throw err;
  }
  return serializeOne(outlet);
}

export async function deleteOutletPhoto(userId: string, outletId: string, photoId: string, ctx: RequestContext) {
  const { outlet } = await requireOwnOutlet(userId, outletId);
  const photo = await db<OutletPhotoRow>("outlet_photos").where({ id: photoId, outlet_id: outlet.id }).first();
  if (!photo) {
    throw new ApiError({ status: 404, type: "not_found", code: "photo_not_found", message: "That photo isn't on these premises." });
  }
  if (KEEPS_PHOTOS.includes(outlet.status)) {
    const count = Number(
      (await db("outlet_photos").where({ outlet_id: outlet.id }).count<{ count: string }[]>("* as count"))[0]?.count ?? 0,
    );
    if (count <= MIN_OUTLET_PHOTOS) {
      invalid("photos_required", `Keep at least ${MIN_OUTLET_PHOTOS} photos. Add the new one first, then remove this one.`);
    }
  }
  await db.transaction(async (trx) => {
    await trx("outlet_photos").where({ id: photo.id }).delete();
    await audit(trx, userId, "outlet.photo_removed", outlet.id, ctx, { photo_id: photo.id });
  });
  await outletStorage().deleteObject(photo.storage_key).catch(() => undefined);
  return serializeOne(outlet);
}

export async function readOutletPhoto(outletId: string, photoId: string, merchantId?: string) {
  const q = db<OutletPhotoRow>("outlet_photos").where({ id: photoId, outlet_id: outletId });
  if (merchantId) q.andWhere({ merchant_id: merchantId });
  const photo = await q.first();
  if (!photo) {
    throw new ApiError({ status: 404, type: "not_found", code: "photo_not_found", message: "That photo isn't on these premises." });
  }
  const body = await outletStorage()
    .getObject(photo.storage_key)
    .catch(() => {
      throw new ApiError({ status: 404, type: "not_found", code: "photo_bytes_missing", message: "That file is no longer stored." });
    });
  return { body, contentType: photo.content_type, originalName: photo.original_name };
}

export async function readOwnOutletPhoto(userId: string, outletId: string, photoId: string) {
  const { merchant } = await requireOwnOutlet(userId, outletId);
  return readOutletPhoto(outletId, photoId, merchant.id);
}

// ---------------------------------------------------------------------
// Submit / pause / resume
// ---------------------------------------------------------------------

export async function submitOutlet(userId: string, outletId: string, ctx: RequestContext) {
  const { merchant, outlet } = await requireOwnOutlet(userId, outletId);
  if (!SUBMITTABLE.includes(outlet.status)) {
    conflict("outlet_not_submittable", "These premises are already with CRAL or approved.");
  }
  if (outlet.kind === "garage" && (outlet.service_types ?? []).length === 0) {
    invalid("service_types_required", "Tick at least one service you do here.", "service_types");
  }
  const photoCount = Number(
    (await db("outlet_photos").where({ outlet_id: outlet.id }).count<{ count: string }[]>("* as count"))[0]?.count ?? 0,
  );
  if (photoCount < MIN_OUTLET_PHOTOS) {
    invalid("photos_required", `Add at least ${MIN_OUTLET_PHOTOS} photos: the front with your sign, and where the work is done.`);
  }

  // A reviewer who already has it gets it straight back; otherwise it joins the queue.
  const next: OutletStatus = outlet.status !== "draft" && outlet.review_assignee ? "review" : "pending";
  const notificationIds: string[] = [];
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<OutletRow>("outlets")
      .where({ id: outlet.id, status: outlet.status })
      .update({ status: next, submitted_at: new Date() })
      .returning("*");
    if (!row) conflict("outlet_not_submittable", "These premises changed while you were sending them. Reload and try again.");
    await audit(trx, userId, "outlet.submitted", outlet.id, ctx, { status: outlet.status }, { status: next });
    notificationIds.push(
      await notify(trx, {
        merchantId: merchant.id,
        category: "review",
        title: `${row.name} is with CRAL for a visit`,
        body: "Someone from CRAL will visit these premises before they can take requests. We'll tell you when it's decided.",
        ref: row.name,
        subjectType: "outlet",
        subjectId: row.id,
      }),
    );
    return row;
  });
  await enqueueNotificationDelivery(merchant.id, notificationIds);
  return serializeOne(updated);
}

async function setPause(userId: string, outletId: string, ctx: RequestContext, pausing: boolean) {
  const { outlet } = await requireOwnOutlet(userId, outletId);
  const from: OutletStatus = pausing ? "live" : "paused";
  const to: OutletStatus = pausing ? "paused" : "live";
  if (outlet.status !== from) {
    conflict(pausing ? "not_live" : "not_paused", pausing ? "Only approved premises can be paused." : "These premises aren't paused.");
  }
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<OutletRow>("outlets").where({ id: outlet.id, status: from }).update({ status: to }).returning("*");
    if (!row) conflict(pausing ? "not_live" : "not_paused", "These premises changed. Reload and try again.");
    await audit(trx, userId, pausing ? "outlet.paused" : "outlet.resumed", outlet.id, ctx, { status: from }, { status: to });
    return row;
  });
  return serializeOne(updated);
}

export const pauseOutlet = (userId: string, outletId: string, ctx: RequestContext) => setPause(userId, outletId, ctx, true);
export const resumeOutlet = (userId: string, outletId: string, ctx: RequestContext) => setPause(userId, outletId, ctx, false);

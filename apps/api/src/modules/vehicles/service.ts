import { ApiError, kes, type Money, type PaginatedResult } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { appendVehicleEvent, nextListingRef } from "../../lib/vehicle-events.js";
import { rethrowRegistrationConflict } from "../../lib/pg-errors.js";
import { emailAdapter } from "../../lib/adapters.js";
import { emailHeading, emailLayout, emailMuted, emailParagraph } from "../../lib/email-templates.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import { getOrCreateMerchant, type RequestContext } from "../merchant/service.js";
import type {
  DocumentReviewState,
  DocumentRow,
  MerchantRow,
  VehicleEventRow,
  VehicleRow,
  VehicleStatus,
} from "../merchant/db-types.js";
import type {
  CreateVehicleInput,
  DeleteVehicleInput,
  ListVehiclesQuery,
  MessageReviewerInput,
  PriceAvailabilityInput,
  VehicleFilter,
} from "./schemas.js";

const VEHICLE_DOC_KINDS = ["logbook", "comprehensive_insurance", "tracker_certificate"] as const;
type VehicleDocKind = (typeof VEHICLE_DOC_KINDS)[number];
const OWNER_DOC_KINDS = ["national_id", "kra_pin"] as const;
const EXPIRING_WITHIN_DAYS = 30;
const VERIFICATION_FEE = kes(150000); // KES 1,500
const VERIFICATION_VALID_DAYS = 365;

// Built lazily — see merchant/service.ts's identical note.
let storageAdapter: ReturnType<typeof createStorageAdapter> | null = null;
function getStorageAdapter(): ReturnType<typeof createStorageAdapter> {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

function complianceEmail(): string {
  return process.env.COMPLIANCE_EMAIL ?? "compliance@cral.co.ke";
}

// ---------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------

async function requireOwnVehicle(userId: string, vehicleId: string): Promise<{ merchant: MerchantRow; vehicle: VehicleRow }> {
  const merchant = await getOrCreateMerchant(userId);
  const vehicle = await db<VehicleRow>("vehicles").where({ id: vehicleId, merchant_id: merchant.id }).first();
  if (!vehicle) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "vehicle_not_found",
      message: "That vehicle doesn't exist on your fleet.",
    });
  }
  return { merchant, vehicle };
}

// ---------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------

function bucketOf(status: VehicleStatus): Exclude<VehicleFilter, "all"> {
  if (status === "draft") return "draft";
  if (status === "pending" || status === "review") return "awaiting_approval";
  if (status === "action" || status === "rejected") return "needs_action";
  return "live"; // live | paused
}

function moneyOrNull(vehicle: VehicleRow): Money | null {
  return vehicle.daily_rate_amount ? kes(vehicle.daily_rate_amount) : null;
}

/**
 * The state a document *effectively* shows in the portal, layering the
 * automatic "about to expire" check (design's `expiring` state, e.g. v5's
 * "Automatic check" timeline entry) on top of the stored review_state. A
 * missing row is its own state, not modeled in the documents table.
 */
function effectiveDocState(doc: DocumentRow | undefined): DocumentReviewState | "missing" {
  if (!doc) return "missing";
  if (doc.review_state === "rejected") return "rejected";
  if (doc.expires_at) {
    const daysLeft = (new Date(doc.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    if (daysLeft <= EXPIRING_WITHIN_DAYS) return "expiring";
  }
  return doc.review_state === "pending" ? "pending" : "ok";
}

function docInfo(doc: DocumentRow | undefined) {
  if (!doc) return null;
  return {
    document_id: doc.id,
    original_name: doc.original_name,
    review_state: effectiveDocState(doc),
    expires_at: doc.expires_at,
  };
}

function docCount(vehicleDocs: DocumentRow[]): { count: number; hasIssue: boolean } {
  let count = 0;
  let hasIssue = false;
  for (const kind of VEHICLE_DOC_KINDS) {
    const state = effectiveDocState(vehicleDocs.find((d) => d.kind === kind));
    if (state === "missing" || state === "rejected") hasIssue = true;
    else count++;
  }
  return { count, hasIssue };
}

function serializeSummary(vehicle: VehicleRow, vehicleDocs: DocumentRow[]) {
  const { count, hasIssue } = docCount(vehicleDocs);
  return {
    id: vehicle.id,
    listing_ref: vehicle.listing_ref,
    registration: vehicle.registration,
    make: vehicle.make,
    model: vehicle.model,
    type: vehicle.type,
    year: vehicle.year,
    seats: vehicle.seats,
    county: vehicle.county,
    pickup_address: vehicle.pickup_address,
    status: vehicle.status,
    verification_badge: vehicle.verification_badge,
    doc_count: count,
    doc_has_issue: hasIssue,
    daily_rate: moneyOrNull(vehicle),
    submitted_at: vehicle.submitted_at ? vehicle.submitted_at.toISOString() : null,
    created_at: vehicle.created_at.toISOString(),
  };
}

async function serializeDetail(merchant: MerchantRow, vehicle: VehicleRow) {
  const [vehicleDocs, ownerDocs, events, user] = await Promise.all([
    db<DocumentRow>("documents").where({ vehicle_id: vehicle.id }),
    db<DocumentRow>("documents").where({ merchant_id: merchant.id, vehicle_id: null }),
    db<VehicleEventRow>("vehicle_events").where({ vehicle_id: vehicle.id }).orderBy("occurred_at", "desc"),
    db("users").where({ id: merchant.user_id }).first(),
  ]);

  const photos = vehicleDocs.filter((d) => d.kind === "vehicle_photo");
  const ownerDocsComplete = OWNER_DOC_KINDS.every((kind) => ownerDocs.some((d) => d.kind === kind));
  const ownerDocsUploadedAt = ownerDocs.length
    ? new Date(Math.max(...ownerDocs.map((d) => d.created_at.getTime()))).toISOString()
    : null;
  const merchantName =
    merchant.owner_type === "company" && merchant.company_name
      ? merchant.company_name
      : [merchant.first_name, merchant.surname].filter(Boolean).join(" ") || null;
  // Approval is an admin action (spec'd for the admin portal, not built in
  // Phase 1) — uploading both owner documents is not the same thing as
  // being approved, so the "approved merchant" banner must key off this,
  // not off `ownerDocsComplete`.
  const merchantApproved = merchant.approved_at !== null;

  return {
    ...serializeSummary(vehicle, vehicleDocs),
    transmission: vehicle.transmission,
    fuel: vehicle.fuel,
    colour: vehicle.colour,
    minimum_hire_days: vehicle.minimum_hire_days,
    chauffeured: vehicle.chauffeured,
    verification_badge_expires_at: vehicle.verification_badge_expires_at
      ? vehicle.verification_badge_expires_at.toISOString()
      : null,
    reviewer_note: vehicle.reviewer_note,
    reviewer_note_meta: vehicle.reviewer_note_meta,
    reviewer_note_resolved: vehicle.reviewer_note_resolved,
    documents: {
      logbook: docInfo(vehicleDocs.find((d) => d.kind === "logbook")),
      comprehensive_insurance: docInfo(vehicleDocs.find((d) => d.kind === "comprehensive_insurance")),
      tracker_certificate: docInfo(vehicleDocs.find((d) => d.kind === "tracker_certificate")),
    },
    photos: photos.map((p) => ({ document_id: p.id, original_name: p.original_name })),
    events: events.map((e) => ({
      label: e.label,
      body: e.body,
      tone: e.tone,
      actor_name: e.actor_name,
      occurred_at: e.occurred_at.toISOString(),
    })),
    owner_documents_complete: ownerDocsComplete,
    owner_documents_uploaded_at: ownerDocsUploadedAt,
    merchant_approved: merchantApproved,
    owner_documents: {
      national_id: docInfo(ownerDocs.find((d) => d.kind === "national_id")),
      kra_pin: docInfo(ownerDocs.find((d) => d.kind === "kra_pin")),
    },
    merchant_name: merchantName,
    payout: {
      method: merchant.payout_method,
      detail: merchant.payout_same ? (user?.phone ?? null) : merchant.payout_detail,
      account_name: merchantName,
    },
  };
}

// ---------------------------------------------------------------------
// List
// ---------------------------------------------------------------------

export async function listVehicles(userId: string, query: ListVehiclesQuery) {
  const merchant = await getOrCreateMerchant(userId);

  const allStatuses = await db<VehicleRow>("vehicles").where({ merchant_id: merchant.id }).select("status");
  const counts = { all: allStatuses.length, awaiting_approval: 0, needs_action: 0, live: 0, draft: 0 };
  for (const row of allStatuses) counts[bucketOf(row.status)]++;

  let base = db<VehicleRow>("vehicles").where({ merchant_id: merchant.id });
  if (query.filter !== "all") {
    const statusesForBucket: Record<Exclude<VehicleFilter, "all">, VehicleStatus[]> = {
      draft: ["draft"],
      awaiting_approval: ["pending", "review"],
      needs_action: ["action", "rejected"],
      live: ["live", "paused"],
    };
    base = base.whereIn("status", statusesForBucket[query.filter]);
  }

  const rows = await applyCursor(base.select("*"), {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });

  const paged: PaginatedResult<(typeof rows)[number]> = toPaginatedResult(
    rows,
    query.limit,
    "created_at",
  );
  const vehicleIds = paged.data.map((v) => v.id);
  const docs = vehicleIds.length
    ? await db<DocumentRow>("documents").whereIn("vehicle_id", vehicleIds)
    : [];

  return {
    data: paged.data.map((v) => serializeSummary(v, docs.filter((d) => d.vehicle_id === v.id))),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
    counts,
  };
}

export async function getVehicleDetail(userId: string, vehicleId: string) {
  const { merchant, vehicle } = await requireOwnVehicle(userId, vehicleId);
  return serializeDetail(merchant, vehicle);
}

// ---------------------------------------------------------------------
// Create / duplicate
// ---------------------------------------------------------------------

function dailyRateCents(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export async function createVehicle(userId: string, input: CreateVehicleInput, ctx: RequestContext) {
  const merchant = await getOrCreateMerchant(userId);

  const vehicle = await db.transaction(async (trx) => {
    const listingRef = await nextListingRef(trx);
    const [created] = await trx<VehicleRow>("vehicles")
      .insert({
        id: generateId("vehicle"),
        merchant_id: merchant.id,
        type: input.type,
        make: input.make,
        model: input.model,
        year: input.year,
        registration: input.registration,
        transmission: input.transmission,
        fuel: input.fuel,
        colour: input.colour ?? null,
        seats: input.seats ?? 5,
        county: input.county,
        pickup_address: input.pickup_address,
        daily_rate_amount: dailyRateCents(input.daily_rate) ?? 0,
        minimum_hire_days: input.minimum_hire_days ?? 1,
        chauffeured: input.chauffeured ?? true,
        status: "draft",
        listing_ref: listingRef,
      })
      .returning("*");
    if (!created) throw new Error("Failed to create vehicle");

    await appendVehicleEvent(trx, {
      vehicleId: created.id,
      merchantId: merchant.id,
      kind: "draft_started",
      tone: "grey",
      label: "Draft started",
      body: "Three documents and photos still to add.",
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "vehicle.created",
      entityType: "vehicle",
      entityId: created.id,
      after: { registration: created.registration, status: created.status },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return created;
  }).catch(rethrowRegistrationConflict);

  return serializeDetail(merchant, vehicle);
}

export async function duplicateVehicle(userId: string, vehicleId: string, ctx: RequestContext) {
  const { merchant, vehicle } = await requireOwnVehicle(userId, vehicleId);

  const copy = await db.transaction(async (trx) => {
    const listingRef = await nextListingRef(trx);
    // The source plate is real and unique per merchant, so the copy needs a
    // placeholder the merchant must overwrite before it can be submitted —
    // registration stays NOT NULL/unique, so it can't be left blank.
    const placeholderPlate = `NEW ${generateId("vehicle").slice(-6).toUpperCase()}`;
    const [created] = await trx<VehicleRow>("vehicles")
      .insert({
        id: generateId("vehicle"),
        merchant_id: merchant.id,
        type: vehicle.type,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        registration: placeholderPlate,
        transmission: vehicle.transmission,
        fuel: vehicle.fuel,
        colour: vehicle.colour,
        seats: vehicle.seats,
        county: vehicle.county,
        pickup_address: vehicle.pickup_address,
        daily_rate_amount: vehicle.daily_rate_amount,
        minimum_hire_days: vehicle.minimum_hire_days,
        chauffeured: vehicle.chauffeured,
        status: "draft",
        listing_ref: listingRef,
      })
      .returning("*");
    if (!created) throw new Error("Failed to duplicate vehicle");

    await appendVehicleEvent(trx, {
      vehicleId: created.id,
      merchantId: merchant.id,
      kind: "duplicated",
      tone: "grey",
      label: `Draft copied from ${vehicle.registration}`,
      body: "Add the registration and its own documents.",
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "vehicle.duplicated",
      entityType: "vehicle",
      entityId: created.id,
      before: { source_vehicle_id: vehicle.id },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return created;
  });

  return serializeDetail(merchant, copy);
}

// ---------------------------------------------------------------------
// Price & availability
// ---------------------------------------------------------------------

export async function updatePriceAvailability(
  userId: string,
  vehicleId: string,
  input: PriceAvailabilityInput,
  ctx: RequestContext,
) {
  const { merchant, vehicle } = await requireOwnVehicle(userId, vehicleId);
  if (vehicle.status === "pending") {
    conflict("vehicle_pending_review", "This listing is with a reviewer — you can't change it until they've had a first look.");
  }

  const update: Record<string, unknown> = {};
  if (input.daily_rate !== undefined) update.daily_rate_amount = dailyRateCents(input.daily_rate);
  if (input.minimum_hire_days !== undefined) update.minimum_hire_days = input.minimum_hire_days;
  if (input.county !== undefined) update.county = input.county;
  if (input.pickup_address !== undefined) update.pickup_address = input.pickup_address;
  if (input.chauffeured !== undefined) update.chauffeured = input.chauffeured;

  const rate = (update.daily_rate_amount as number | undefined) ?? vehicle.daily_rate_amount;
  const minDays = (update.minimum_hire_days as number | undefined) ?? vehicle.minimum_hire_days;

  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<VehicleRow>("vehicles").where({ id: vehicle.id }).update(update).returning("*");
    if (!row) throw new Error("Failed to update vehicle");

    await appendVehicleEvent(trx, {
      vehicleId: vehicle.id,
      merchantId: merchant.id,
      kind: "price_updated",
      tone: "blue",
      label: "Price updated",
      body: `KES ${Math.round(rate / 100).toLocaleString("en-KE")} a day, minimum ${minDays} day${minDays === 1 ? "" : "s"}.`,
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "vehicle.price_updated",
      entityType: "vehicle",
      entityId: vehicle.id,
      before: { daily_rate_amount: vehicle.daily_rate_amount, minimum_hire_days: vehicle.minimum_hire_days },
      after: { daily_rate_amount: rate, minimum_hire_days: minDays },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  return serializeDetail(merchant, updated);
}

// ---------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------

function conflict(code: string, message: string): never {
  throw new ApiError({ status: 409, type: "conflict", code, message });
}

const MIN_SUBMISSION_PHOTOS = 3;

export async function submitVehicle(userId: string, vehicleId: string, ctx: RequestContext) {
  const { merchant, vehicle } = await requireOwnVehicle(userId, vehicleId);
  if (vehicle.status !== "draft") conflict("vehicle_not_draft", "Only a draft listing can be submitted.");

  const vehicleDocs = await db<DocumentRow>("documents").where({ vehicle_id: vehicle.id });
  if (!vehicle.daily_rate_amount) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "daily_rate_required",
      message: "Add a daily rate before submitting.",
    });
  }
  const { count, hasIssue } = docCount(vehicleDocs);
  if (count < VEHICLE_DOC_KINDS.length || hasIssue) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "documents_incomplete",
      message: "Attach all three documents before submitting.",
    });
  }
  const photoCount = vehicleDocs.filter((d) => d.kind === "vehicle_photo").length;
  if (photoCount < MIN_SUBMISSION_PHOTOS) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "photos_incomplete",
      message: `Add at least ${MIN_SUBMISSION_PHOTOS} photos before submitting.`,
    });
  }

  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<VehicleRow>("vehicles")
      .where({ id: vehicle.id })
      .update({ status: "pending", submitted_at: new Date() })
      .returning("*");
    if (!row) throw new Error("Failed to submit vehicle");
    await appendVehicleEvent(trx, {
      vehicleId: vehicle.id,
      merchantId: merchant.id,
      kind: "submitted",
      tone: "amber",
      label: "Submitted for review",
      body: "In the queue. Reviews take up to two working days.",
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "vehicle.submitted",
      entityType: "vehicle",
      entityId: vehicle.id,
      after: { status: "pending" },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  return serializeDetail(merchant, updated);
}

async function setPause(userId: string, vehicleId: string, ctx: RequestContext, pausing: boolean) {
  const { merchant, vehicle } = await requireOwnVehicle(userId, vehicleId);
  if (pausing && vehicle.status !== "live") conflict("not_live", "Only a live listing can be taken down.");
  if (!pausing && vehicle.status !== "paused") conflict("not_paused", "Only a paused listing can be put back on the market.");

  const nextStatus: VehicleStatus = pausing ? "paused" : "live";
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<VehicleRow>("vehicles").where({ id: vehicle.id }).update({ status: nextStatus }).returning("*");
    if (!row) throw new Error("Failed to update vehicle status");
    await appendVehicleEvent(trx, {
      vehicleId: vehicle.id,
      merchantId: merchant.id,
      kind: pausing ? "paused" : "resumed",
      tone: pausing ? "grey" : "green",
      label: pausing ? "Taken down by you" : "Back on the market",
      body: pausing ? "Hidden from search. Existing bookings stand." : "Visible in search again.",
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: pausing ? "vehicle.paused" : "vehicle.resumed",
      entityType: "vehicle",
      entityId: vehicle.id,
      before: { status: vehicle.status },
      after: { status: nextStatus },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  return serializeDetail(merchant, updated);
}

export const pauseVehicle = (userId: string, vehicleId: string, ctx: RequestContext) =>
  setPause(userId, vehicleId, ctx, true);
export const resumeVehicle = (userId: string, vehicleId: string, ctx: RequestContext) =>
  setPause(userId, vehicleId, ctx, false);

export async function deleteVehicle(userId: string, vehicleId: string, input: DeleteVehicleInput, ctx: RequestContext) {
  const { merchant, vehicle } = await requireOwnVehicle(userId, vehicleId);

  const normalize = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");
  if (normalize(input.registration) !== normalize(vehicle.registration)) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "registration_mismatch",
      message: "Type the registration exactly to confirm.",
      field: "registration",
    });
  }

  await db.transaction(async (trx) => {
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "vehicle.deleted",
      entityType: "vehicle",
      entityId: vehicle.id,
      before: { registration: vehicle.registration, status: vehicle.status },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    // Cascades to its documents and vehicle_events.
    await trx<VehicleRow>("vehicles").where({ id: vehicle.id, merchant_id: merchant.id }).delete();
  });
}

// ---------------------------------------------------------------------
// Message the reviewer
// ---------------------------------------------------------------------

export async function messageReviewer(userId: string, vehicleId: string, input: MessageReviewerInput, ctx: RequestContext) {
  const { merchant, vehicle } = await requireOwnVehicle(userId, vehicleId);
  if (vehicle.status === "draft") {
    conflict("vehicle_not_submitted", "There's no reviewer assigned until you submit this listing.");
  }
  if (vehicle.status === "pending") {
    conflict("vehicle_pending_review", "This listing is with a reviewer — there's nothing to discuss until they've had a first look.");
  }
  const user = await db("users").where({ id: userId }).first();

  await db.transaction(async (trx) => {
    await appendVehicleEvent(trx, {
      vehicleId: vehicle.id,
      merchantId: merchant.id,
      kind: "message_sent",
      tone: "blue",
      label: "You messaged the reviewer",
      body: input.message,
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "vehicle.message_sent",
      entityType: "vehicle",
      entityId: vehicle.id,
      after: { message: input.message },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  await emailAdapter.send({
    to: complianceEmail(),
    subject: `RE: ${vehicle.listing_ref} · ${vehicle.registration}`,
    html: emailLayout({
      preheader: `Message from ${user?.email ?? "a merchant"} about ${vehicle.registration}`,
      bodyHtml: [
        emailHeading("A merchant sent a message"),
        emailParagraph(`${vehicle.listing_ref} · ${vehicle.registration} · ${vehicle.make} ${vehicle.model}`),
        emailParagraph(input.message),
        emailMuted(`From ${user?.email ?? "unknown"}`),
      ].join(""),
    }),
    text: `${vehicle.listing_ref} · ${vehicle.registration}\n\n${input.message}\n\nFrom ${user?.email ?? "unknown"}`,
  });

  return serializeDetail(merchant, vehicle);
}

// ---------------------------------------------------------------------
// Verification badge (records intent only — no M-Pesa call, per the
// owner's 2026-08-26 decision: payments aren't built yet)
// ---------------------------------------------------------------------

export async function requestVerification(userId: string, vehicleId: string, ctx: RequestContext) {
  const { merchant, vehicle } = await requireOwnVehicle(userId, vehicleId);
  if (vehicle.verification_badge !== "none") {
    conflict("verification_already_requested", "A verification badge is already active or pending for this vehicle.");
  }
  if (vehicle.status !== "live" && vehicle.status !== "paused") {
    conflict("vehicle_not_approved", "The verified badge is only available once your listing has been approved.");
  }

  const user = await db("users").where({ id: userId }).first();
  const rawPhone = merchant.payout_same ? (user?.phone ?? null) : merchant.payout_detail;
  const phone = rawPhone ? `+254${rawPhone.replace(/\D/g, "").replace(/^0+/, "").replace(/^254/, "")}` : null;

  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<VehicleRow>("vehicles")
      .where({ id: vehicle.id })
      .update({ verification_badge: "pending" })
      .returning("*");
    if (!row) throw new Error("Failed to update vehicle");
    await appendVehicleEvent(trx, {
      vehicleId: vehicle.id,
      merchantId: merchant.id,
      kind: "verification_requested",
      tone: "amber",
      label: "Verification requested",
      body: `M-Pesa request for KES ${(VERIFICATION_FEE.amount / 100).toLocaleString("en-KE")} sent to ${phone ?? "your payout number"}.`,
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "vehicle.verification_requested",
      entityType: "vehicle",
      entityId: vehicle.id,
      after: { verification_badge: "pending", fee: VERIFICATION_FEE },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  return serializeDetail(merchant, updated);
}

// Exported for the route to size the copy shown before confirming.
export const VERIFICATION_FEE_MONEY = VERIFICATION_FEE;
export const VERIFICATION_VALID_YEARS = VERIFICATION_VALID_DAYS / 365;

// ---------------------------------------------------------------------
// Vehicle documents
// ---------------------------------------------------------------------

export interface UploadVehicleDocumentInput {
  kind: VehicleDocKind;
  expiresAt?: string | undefined;
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
}

function buildStorageKey(merchantId: string, vehicleId: string, kind: string, name: string): string {
  const safeName = name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(-100);
  return `merchant/${merchantId}/${vehicleId}/${kind}/${generateId("document")}-${safeName}`;
}

const DOC_LABELS: Record<VehicleDocKind, string> = {
  logbook: "Logbook",
  comprehensive_insurance: "Comprehensive insurance",
  tracker_certificate: "Car tracker certificate",
};

export async function uploadVehicleDocument(
  userId: string,
  vehicleId: string,
  input: UploadVehicleDocumentInput,
  ctx: RequestContext,
) {
  const { merchant, vehicle } = await requireOwnVehicle(userId, vehicleId);

  const key = buildStorageKey(merchant.id, vehicle.id, input.kind, input.file.originalname);
  await getStorageAdapter().putObject({ key, body: input.file.buffer, contentType: input.file.mimetype });

  const updated = await db.transaction(async (trx) => {
    await trx<DocumentRow>("documents").where({ vehicle_id: vehicle.id, kind: input.kind }).delete();
    await trx<DocumentRow>("documents").insert({
      id: generateId("document"),
      merchant_id: merchant.id,
      vehicle_id: vehicle.id,
      kind: input.kind,
      storage_key: key,
      original_name: input.file.originalname,
      size_bytes: input.file.size,
      content_type: input.file.mimetype,
      review_state: "pending",
      expires_at: input.expiresAt ?? null,
    });

    // A still-draft vehicle is just being built — attaching a document
    // there is normal progress toward its first submission, not something
    // that should silently submit it. A vehicle already live/paused stays
    // as-is too — a re-upload there is a routine renewal, not a re-review
    // of the whole listing. `pending` means submitted but never yet opened
    // by a reviewer — a document swapped in before that first look is
    // still just part of the same unopened submission, so it stays
    // `pending`, not `review` ("Under review" would falsely claim someone
    // is actively looking at it right now). Only `review`/`action`/
    // `rejected` — states a reviewer has actually engaged with at least
    // once — go back to `review` on a re-upload, since that's genuinely
    // putting it back in front of them.
    const nextStatus: VehicleStatus =
      vehicle.status === "draft" || vehicle.status === "live" || vehicle.status === "paused" || vehicle.status === "pending"
        ? vehicle.status
        : "review";

    const [row] = await trx<VehicleRow>("vehicles")
      .where({ id: vehicle.id })
      .update({ status: nextStatus, reviewer_note_resolved: true })
      .returning("*");
    if (!row) throw new Error("Failed to update vehicle");

    const isFirstAttachment = vehicle.status === "draft";
    await appendVehicleEvent(trx, {
      vehicleId: vehicle.id,
      merchantId: merchant.id,
      kind: "document_replaced",
      tone: "blue",
      label: isFirstAttachment ? `${DOC_LABELS[input.kind]} attached` : `${DOC_LABELS[input.kind]} re-uploaded`,
      body: isFirstAttachment ? "Added to your draft." : "Back in the review queue.",
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "vehicle.document_uploaded",
      entityType: "vehicle",
      entityId: vehicle.id,
      after: { kind: input.kind, original_name: input.file.originalname },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  return serializeDetail(merchant, updated);
}

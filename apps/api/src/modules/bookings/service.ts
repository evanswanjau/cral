import type { Knex } from "knex";
import { ApiError, kes, type Money, type PaginatedResult } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { generateOtpCode, hashCode } from "../../lib/otp.js";
import { maskIdentifier } from "../../lib/mask.js";
import { emailAdapter } from "../../lib/adapters.js";
import { emailCode, emailHeading, emailLayout, emailMuted, emailParagraph } from "../../lib/email-templates.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import { computeBookingPricing, computeLateCancellationFee } from "../../lib/booking-pricing.js";
import { getOrCreateMerchant, type RequestContext } from "../merchant/service.js";
import type { VehicleRow } from "../merchant/db-types.js";
import type {
  BookingEventRow,
  BookingReportRow,
  BookingRow,
  BookingStatus,
  HandoverRow,
} from "./db-types.js";
import type {
  BookingFilter,
  CancelBookingInput,
  CreateBookingReportInput,
  CreateHandoverInput,
  DeclineBookingInput,
  HandoverConditionInput,
  ListBookingsQuery,
  RateHirerInput,
  VerifyHandoverOtpInput,
} from "./schemas.js";

const RESPONSE_WINDOW_HOURS = 12;
const HANDOVER_SESSION_MINUTES = 20;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const DEPOSIT_HOLD_HOURS = 24;
// Filing a claim extends the hold while CRAL reviews it — the design's
// return-modal copy ("CRAL holds the deposit for 48 hours while a claim
// is reviewed") is a second clock, not a conflict with the 24h normal
// release; see returned_at's migration comment.
const CLAIM_DEPOSIT_HOLD_HOURS = 48;
const RATING_WINDOW_DAYS = 14;
const REPORT_WINDOW_DAYS = 14;

// Built lazily — see merchant/service.ts's identical note.
let storageAdapter: ReturnType<typeof createStorageAdapter> | null = null;
function getStorageAdapter(): ReturnType<typeof createStorageAdapter> {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

const HANDOVER_TERMINAL_STATES = ["completed", "expired", "failed", "offline_pending", "reconciled"];

/**
 * Enforces the 20-minute session window (`handovers.expires_at`) that was
 * written and documented but never actually checked — a handover could
 * previously sit half-finished indefinitely. Marks the row `expired` on
 * first detection so the state persists past this one request.
 */
async function requireHandoverNotExpired(handover: HandoverRow): Promise<void> {
  if (HANDOVER_TERMINAL_STATES.includes(handover.state)) return;
  if (handover.expires_at.getTime() >= Date.now()) return;
  await db<HandoverRow>("handovers").where({ id: handover.id }).update({ state: "expired" });
  conflict("session_expired", "This handover session timed out. Reopen it to try again.");
}

function conflict(code: string, message: string): never {
  throw new ApiError({ status: 409, type: "conflict", code, message });
}

function unprocessable(code: string, message: string, field?: string): never {
  throw new ApiError({ status: 422, type: "validation_error", code, message, ...(field ? { field } : {}) });
}

// ---------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------

async function requireOwnBooking(userId: string, bookingId: string): Promise<{ merchant: Awaited<ReturnType<typeof getOrCreateMerchant>>; booking: BookingRow }> {
  const merchant = await getOrCreateMerchant(userId);
  const booking = await db<BookingRow>("bookings").where({ id: bookingId, merchant_id: merchant.id }).first();
  if (!booking) {
    throw new ApiError({ status: 404, type: "not_found", code: "booking_not_found", message: "That booking doesn't exist on your account." });
  }
  return { merchant, booking };
}

async function requireOwnHandover(
  userId: string,
  handoverId: string,
): Promise<{ merchant: Awaited<ReturnType<typeof getOrCreateMerchant>>; booking: BookingRow; handover: HandoverRow }> {
  const merchant = await getOrCreateMerchant(userId);
  const handover = await db<HandoverRow>("handovers").where({ id: handoverId }).first();
  if (!handover) {
    throw new ApiError({ status: 404, type: "not_found", code: "handover_not_found", message: "That handover session doesn't exist." });
  }
  const booking = await db<BookingRow>("bookings").where({ id: handover.booking_id, merchant_id: merchant.id }).first();
  if (!booking) {
    throw new ApiError({ status: 404, type: "not_found", code: "handover_not_found", message: "That handover session doesn't exist." });
  }
  return { merchant, booking, handover };
}

// ---------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------

function money(amount: number | null, currency: string | null): Money | null {
  return amount === null || currency === null ? null : { amount, currency };
}

function bucketOf(status: BookingStatus): Exclude<BookingFilter, "all"> {
  if (status === "requested") return "requests";
  if (status === "confirmed") return "upcoming";
  if (status === "active") return "on_hire";
  if (status === "completed") return "completed";
  return "cancelled"; // declined | expired | cancelled
}

interface HirerInfo {
  full_name: string;
  email: string;
}

function serializeSummary(booking: BookingRow, vehicle: VehicleRow, hirer: HirerInfo) {
  return {
    id: booking.id,
    ref: booking.ref,
    status: booking.status,
    hirer_name: hirer.full_name,
    // No corporate-hirer concept modeled yet (users table has no company
    // flag for the customer role) — the design's "CORP" badge on Safiri
    // Tours Ltd has nothing to key off in this phase. Always false.
    hirer_is_corporate: false,
    vehicle_registration: vehicle.registration,
    vehicle_make: vehicle.make,
    vehicle_model: vehicle.model,
    vehicle_type: vehicle.type,
    vehicle_year: vehicle.year,
    vehicle_chauffeured: vehicle.chauffeured,
    vehicle_pickup_address: vehicle.pickup_address,
    pickup_at: booking.pickup_at.toISOString(),
    dropoff_at: booking.dropoff_at.toISOString(),
    merchant_net: kes(booking.merchant_net_amount),
    requested_at: booking.created_at.toISOString(),
    response_due_at: booking.response_due_at ? booking.response_due_at.toISOString() : null,
  };
}

function serializeEvent(e: BookingEventRow) {
  return {
    kind: e.kind,
    label: e.label,
    body: e.body,
    tone: e.tone,
    actor_type: e.actor_type,
    occurred_at: e.occurred_at.toISOString(),
  };
}

async function serializeDetail(booking: BookingRow, vehicle: VehicleRow, hirer: HirerInfo) {
  const events = await db<BookingEventRow>("booking_events")
    .where({ booking_id: booking.id })
    .orderBy("occurred_at", "desc");

  return {
    ...serializeSummary(booking, vehicle, hirer),
    gross: kes(booking.gross_amount),
    commission: kes(booking.commission_amount),
    merchant_net: kes(booking.merchant_net_amount),
    deposit: kes(booking.deposit_amount),
    cancellation_fee: money(booking.cancellation_fee_amount, booking.cancellation_fee_currency),
    refund: money(booking.refund_amount, booking.refund_currency),
    pickup_location: booking.pickup_location,
    dropoff_location: booking.dropoff_location,
    note_from_hirer: booking.note_from_hirer,
    payout_method: booking.payout_method,
    payout_detail: booking.payout_detail,
    payout_account_name: booking.payout_account_name,
    has_pickup_condition_photos: booking.has_pickup_condition_photos,
    deposit_release_at: booking.deposit_release_at ? booking.deposit_release_at.toISOString() : null,
    rating_open_until: booking.rating_open_until ? booking.rating_open_until.toISOString() : null,
    events: events.map(serializeEvent),
  };
}

function serializeHandover(handover: HandoverRow) {
  // qr_scan and the hirer-side confirmation are unreachable this phase —
  // see openapi/merchant-bookings.yaml's top-level description.
  return {
    id: handover.id,
    booking_id: handover.booking_id,
    kind: handover.kind,
    state: handover.state,
    required: ["otp", "condition", "confirm"],
    masked_destination: handover.masked_destination,
    expires_at: handover.expires_at.toISOString(),
    condition: {
      odometer_km: handover.odometer_km,
      fuel_level: handover.fuel_level,
      notes: handover.condition_notes,
    },
  };
}

async function hirerInfoOf(hirerId: string): Promise<HirerInfo> {
  const user = await db("users").where({ id: hirerId }).first();
  return { full_name: user?.full_name ?? "Hirer", email: user?.email ?? "" };
}

async function vehicleOf(vehicleId: string): Promise<VehicleRow> {
  const vehicle = await db<VehicleRow>("vehicles").where({ id: vehicleId }).first();
  if (!vehicle) throw new Error(`Booking references a missing vehicle ${vehicleId}`);
  return vehicle;
}

// ---------------------------------------------------------------------
// List / detail
// ---------------------------------------------------------------------

export async function listBookings(userId: string, query: ListBookingsQuery) {
  const merchant = await getOrCreateMerchant(userId);

  const allStatuses = await db<BookingRow>("bookings").where({ merchant_id: merchant.id }).select("status");
  const counts = { all: allStatuses.length, requests: 0, upcoming: 0, on_hire: 0, completed: 0, cancelled: 0 };
  for (const row of allStatuses) counts[bucketOf(row.status)]++;

  let base = db<BookingRow>("bookings").where({ merchant_id: merchant.id });
  if (query.filter !== "all") {
    const statusesForFilter: Record<Exclude<BookingFilter, "all">, BookingStatus[]> = {
      requests: ["requested"],
      upcoming: ["confirmed"],
      on_hire: ["active"],
      completed: ["completed"],
      cancelled: ["cancelled", "declined", "expired"],
    };
    base = base.whereIn("status", statusesForFilter[query.filter]);
  }

  const rows = await applyCursor(base.select("*"), {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const paged: PaginatedResult<(typeof rows)[number]> = toPaginatedResult(rows, query.limit, "created_at");

  const vehicleIds = [...new Set(paged.data.map((b) => b.vehicle_id))];
  const hirerIds = [...new Set(paged.data.map((b) => b.hirer_id))];
  const [vehicles, hirers] = await Promise.all([
    vehicleIds.length ? db<VehicleRow>("vehicles").whereIn("id", vehicleIds) : [],
    hirerIds.length ? db("users").whereIn("id", hirerIds) : [],
  ]);
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const hirerById = new Map(hirers.map((h) => [h.id, h]));

  return {
    data: paged.data.map((b) =>
      serializeSummary(b, vehicleById.get(b.vehicle_id)!, {
        full_name: hirerById.get(b.hirer_id)?.full_name ?? "Hirer",
        email: hirerById.get(b.hirer_id)?.email ?? "",
      }),
    ),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
    counts,
  };
}

export async function getBookingDetail(userId: string, bookingId: string) {
  const { booking } = await requireOwnBooking(userId, bookingId);
  const [vehicle, hirer] = await Promise.all([vehicleOf(booking.vehicle_id), hirerInfoOf(booking.hirer_id)]);
  return serializeDetail(booking, vehicle, hirer);
}

// ---------------------------------------------------------------------
// Lifecycle: confirm / decline / cancel
// ---------------------------------------------------------------------

async function appendBookingEvent(
  trx: Knex.Transaction | Knex,
  input: {
    bookingId: string;
    merchantId: string;
    kind: string;
    tone: BookingEventRow["tone"];
    label: string;
    body?: string | null;
    actorType: BookingEventRow["actor_type"];
    actorName?: string | null;
  },
): Promise<void> {
  await trx<BookingEventRow>("booking_events").insert({
    id: generateId("bookingEvent"),
    booking_id: input.bookingId,
    merchant_id: input.merchantId,
    kind: input.kind,
    tone: input.tone,
    label: input.label,
    body: input.body ?? null,
    actor_type: input.actorType,
    actor_name: input.actorName ?? null,
  });
}

export async function confirmBooking(userId: string, bookingId: string, ctx: RequestContext) {
  const { merchant, booking } = await requireOwnBooking(userId, bookingId);
  if (booking.status !== "requested") conflict("already_answered", "This request has already been answered.");
  if (booking.response_due_at && booking.response_due_at.getTime() < Date.now()) {
    conflict("response_window_closed", "The 12-hour response window for this request has closed.");
  }

  const [vehicle, hirer] = await Promise.all([vehicleOf(booking.vehicle_id), hirerInfoOf(booking.hirer_id)]);

  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<BookingRow>("bookings")
      .where({ id: booking.id })
      .update({ status: "confirmed", response_due_at: null })
      .returning("*");
    if (!row) throw new Error("Failed to confirm booking");

    await appendBookingEvent(trx, {
      bookingId: booking.id,
      merchantId: merchant.id,
      kind: "confirmed",
      tone: "blue",
      label: "You accepted the booking",
      body: `Pick-up details sent to ${hirer.full_name}.`,
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "booking.confirmed",
      entityType: "booking",
      entityId: booking.id,
      before: { status: booking.status },
      after: { status: "confirmed" },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  if (hirer.email) {
    await emailAdapter.send({
      to: hirer.email,
      subject: `${booking.ref} confirmed · ${vehicle.registration}`,
      html: emailLayout({
        preheader: `Your booking with ${vehicle.registration} is confirmed`,
        bodyHtml: [
          emailHeading("Your booking is confirmed"),
          emailParagraph(`${booking.ref} · ${vehicle.make} ${vehicle.model} · ${vehicle.registration}`),
          emailMuted("You'll get a pickup code closer to your pickup time."),
        ].join(""),
      }),
      text: `${booking.ref} confirmed · ${vehicle.make} ${vehicle.model} · ${vehicle.registration}`,
    });
  }

  return serializeDetail(updated, vehicle, hirer);
}

export async function declineBooking(userId: string, bookingId: string, input: DeclineBookingInput, ctx: RequestContext) {
  const { merchant, booking } = await requireOwnBooking(userId, bookingId);
  if (booking.status !== "requested") conflict("already_answered", "This request has already been answered.");

  const [vehicle, hirer] = await Promise.all([vehicleOf(booking.vehicle_id), hirerInfoOf(booking.hirer_id)]);

  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<BookingRow>("bookings")
      .where({ id: booking.id })
      .update({
        status: "declined",
        response_due_at: null,
        decline_reason_code: input.reason_code,
        decline_note: input.note ?? null,
        refund_amount: booking.gross_amount,
        refund_currency: booking.gross_currency,
        commission_amount: 0,
        merchant_net_amount: 0,
      })
      .returning("*");
    if (!row) throw new Error("Failed to decline booking");

    await appendBookingEvent(trx, {
      bookingId: booking.id,
      merchantId: merchant.id,
      kind: "declined",
      tone: "red",
      label: "You turned this down",
      body: input.note ?? null,
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "booking.declined",
      entityType: "booking",
      entityId: booking.id,
      before: { status: booking.status },
      after: { status: "declined", reason_code: input.reason_code },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  return serializeDetail(updated, vehicle, hirer);
}

export async function cancelBooking(userId: string, bookingId: string, input: CancelBookingInput, ctx: RequestContext) {
  const { merchant, booking } = await requireOwnBooking(userId, bookingId);
  if (booking.status !== "confirmed" && booking.status !== "active") {
    conflict("booking_not_cancellable", "Only a confirmed or active booking can be cancelled.");
  }

  const [vehicle, hirer] = await Promise.all([vehicleOf(booking.vehicle_id), hirerInfoOf(booking.hirer_id)]);
  const isLate = Date.now() >= booking.pickup_at.getTime();

  const update: Partial<BookingRow> = { status: "cancelled", cancel_reason: input.reason };
  let eventBody: string;
  if (isLate) {
    const { fee, commission, merchantKeeps, refund } = computeLateCancellationFee(booking.gross_amount);
    update.cancellation_fee_amount = fee.amount;
    update.cancellation_fee_currency = fee.currency;
    update.commission_amount = commission.amount;
    update.merchant_net_amount = merchantKeeps.amount;
    update.refund_amount = refund.amount;
    update.refund_currency = refund.currency;
    eventBody = "Cancelled late, at or after pick-up — the 25% fee applies.";
  } else {
    update.cancellation_fee_amount = null;
    update.cancellation_fee_currency = null;
    update.commission_amount = 0;
    update.merchant_net_amount = 0;
    update.refund_amount = booking.gross_amount;
    update.refund_currency = booking.gross_currency;
    eventBody = "Cancelled before pick-up — free for the hirer, nothing owed either way.";
  }

  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<BookingRow>("bookings").where({ id: booking.id }).update(update).returning("*");
    if (!row) throw new Error("Failed to cancel booking");

    await appendBookingEvent(trx, {
      bookingId: booking.id,
      merchantId: merchant.id,
      kind: "cancelled",
      tone: isLate ? "red" : "grey",
      label: isLate ? "Cancelled late by you" : "Cancelled by you",
      body: eventBody,
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "booking.cancelled",
      entityType: "booking",
      entityId: booking.id,
      before: { status: booking.status },
      after: { status: "cancelled", late: isLate, reason: input.reason },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  return serializeDetail(updated, vehicle, hirer);
}

// ---------------------------------------------------------------------
// Handover — reduced proof set this phase (see openapi's top description)
// ---------------------------------------------------------------------

export async function createHandover(userId: string, bookingId: string, input: CreateHandoverInput, ctx: RequestContext) {
  const { merchant, booking } = await requireOwnBooking(userId, bookingId);
  if (input.kind === "pickup" && booking.status !== "confirmed") {
    conflict("booking_not_confirmed", "This booking must be confirmed before pickup can start.");
  }
  if (input.kind === "return" && booking.status !== "active") {
    conflict("booking_not_active", "This booking must be active before a return can be logged.");
  }

  const hirer = await hirerInfoOf(booking.hirer_id);
  const vehicle = await vehicleOf(booking.vehicle_id);
  const code = generateOtpCode();
  const now = Date.now();

  const handover = await db.transaction(async (trx) => {
    const [row] = await trx<HandoverRow>("handovers")
      .insert({
        id: generateId("handover"),
        booking_id: booking.id,
        kind: input.kind,
        state: "otp_sent",
        otp_code_hash: hashCode(code),
        otp_attempts: 0,
        otp_sent_at: new Date(now),
        otp_expires_at: new Date(now + OTP_TTL_MINUTES * 60 * 1000),
        masked_destination: hirer.email ? maskIdentifier(hirer.email) : null,
        expires_at: new Date(now + HANDOVER_SESSION_MINUTES * 60 * 1000),
      })
      .returning("*");
    if (!row) throw new Error("Failed to open handover");

    await appendBookingEvent(trx, {
      bookingId: booking.id,
      merchantId: merchant.id,
      kind: `${input.kind}_started`,
      tone: "blue",
      label: input.kind === "pickup" ? "Pickup started" : "Return started",
      body: `Code sent to ${hirer.full_name}.`,
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: `handover.${input.kind}.opened`,
      entityType: "booking",
      entityId: booking.id,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  if (hirer.email) {
    await emailAdapter.send({
      to: hirer.email,
      subject: `Your ${booking.ref} ${input.kind} code`,
      html: emailLayout({
        preheader: `Your one-time code for ${vehicle.registration}`,
        bodyHtml: [
          emailHeading(input.kind === "pickup" ? "Your pickup code" : "Your return code"),
          emailParagraph(`Read this code to the merchant at ${vehicle.registration} to start the ${input.kind === "pickup" ? "hire" : "return"}.`),
          emailCode(code),
          emailMuted("Never share this code except with CRAL merchant staff in person."),
        ].join(""),
      }),
      text: `Your ${booking.ref} ${input.kind} code: ${code}`,
    });
  }

  return serializeHandover(handover);
}

export async function getHandover(userId: string, handoverId: string) {
  const { handover } = await requireOwnHandover(userId, handoverId);
  return serializeHandover(handover);
}

export interface UploadHandoverPhotoInput {
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
}

export async function uploadHandoverPhoto(userId: string, handoverId: string, input: UploadHandoverPhotoInput) {
  const { merchant, booking } = await requireOwnHandover(userId, handoverId);

  const safeName = input.file.originalname.replace(/[^A-Za-z0-9_.-]/g, "_").slice(-100);
  const key = `merchant/${merchant.id}/${booking.vehicle_id}/handover/${generateId("document")}-${safeName}`;
  await getStorageAdapter().putObject({ key, body: input.file.buffer, contentType: input.file.mimetype });

  const [doc] = await db("documents")
    .insert({
      id: generateId("document"),
      merchant_id: merchant.id,
      vehicle_id: booking.vehicle_id,
      booking_id: booking.id,
      kind: "handover_photo",
      storage_key: key,
      original_name: input.file.originalname,
      size_bytes: input.file.size,
      content_type: input.file.mimetype,
      review_state: "ok", // never reviewed by an admin — reuses the column, doesn't mean anything here
    })
    .returning("*");
  if (!doc) throw new Error("Failed to store handover photo");

  return { document_id: doc.id, original_name: doc.original_name };
}

export async function verifyHandoverOtp(userId: string, handoverId: string, input: VerifyHandoverOtpInput, ctx: RequestContext) {
  const { merchant, booking, handover } = await requireOwnHandover(userId, handoverId);
  await requireHandoverNotExpired(handover);

  // Checked ahead of the generic state check: exhausting attempts also
  // moves state to "failed" (below), which would otherwise make this
  // branch unreachable and hide the real reason behind a generic one.
  if (handover.otp_attempts >= OTP_MAX_ATTEMPTS || handover.state === "failed") {
    conflict("otp_attempts_exhausted", "Too many wrong codes. Reopen the handover to try again.");
  }
  if (handover.state !== "otp_sent") {
    conflict("session_not_awaiting_otp", "This session isn't waiting on a code right now.");
  }
  if (handover.otp_expires_at && handover.otp_expires_at.getTime() < Date.now()) {
    unprocessable("otp_expired", "That code has expired. Reopen the handover to send a new one.");
  }

  const matches = handover.otp_code_hash === hashCode(input.code.trim());
  if (!matches) {
    const attempts = handover.otp_attempts + 1;
    await db<HandoverRow>("handovers")
      .where({ id: handover.id })
      .update({ otp_attempts: attempts, state: attempts >= OTP_MAX_ATTEMPTS ? "failed" : "otp_sent" });
    unprocessable("otp_incorrect", "That code doesn't match.");
  }

  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<HandoverRow>("handovers").where({ id: handover.id }).update({ state: "otp_verified" }).returning("*");
    if (!row) throw new Error("Failed to verify handover code");
    await appendBookingEvent(trx, {
      bookingId: booking.id,
      merchantId: merchant.id,
      kind: "otp_verified",
      tone: "grey",
      label: "Hirer's code verified",
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "handover.otp_verified",
      entityType: "booking",
      entityId: booking.id,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  return serializeHandover(updated);
}

export async function logHandoverCondition(userId: string, handoverId: string, input: HandoverConditionInput, ctx: RequestContext) {
  const { booking, handover } = await requireOwnHandover(userId, handoverId);
  await requireHandoverNotExpired(handover);
  if (HANDOVER_TERMINAL_STATES.includes(handover.state)) {
    conflict("session_closed", "This handover session is already closed.");
  }

  const update: Partial<HandoverRow> = { state: "condition_logged" };
  if (input.odometer_km !== undefined) update.odometer_km = input.odometer_km;
  if (input.fuel_level !== undefined) update.fuel_level = input.fuel_level;
  if (input.notes !== undefined) update.condition_notes = input.notes;

  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<HandoverRow>("handovers").where({ id: handover.id }).update(update).returning("*");
    if (!row) throw new Error("Failed to log condition");

    if (handover.kind === "pickup" && input.photo_document_ids?.length) {
      await trx("bookings").where({ id: booking.id }).update({ has_pickup_condition_photos: true });
    }
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "handover.condition_logged",
      entityType: "booking",
      entityId: booking.id,
      after: { odometer_km: input.odometer_km, fuel_level: input.fuel_level, photo_count: input.photo_document_ids?.length ?? 0 },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  return serializeHandover(updated);
}

export async function confirmHandover(userId: string, handoverId: string, ctx: RequestContext) {
  const { merchant, booking, handover } = await requireOwnHandover(userId, handoverId);
  await requireHandoverNotExpired(handover);
  if (handover.state !== "otp_verified" && handover.state !== "condition_logged") {
    conflict("required_steps_incomplete", "Verify the hirer's code before confirming.");
  }

  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<HandoverRow>("handovers")
      .where({ id: handover.id })
      .update({ state: "confirmed", confirmed_at: new Date() })
      .returning("*");
    if (!row) throw new Error("Failed to confirm handover");
    await appendBookingEvent(trx, {
      bookingId: booking.id,
      merchantId: merchant.id,
      kind: "handover_confirmed",
      tone: "green",
      label: "Checked over together",
      body: handover.kind === "pickup" ? "Condition photos attached at pick-up." : "Condition checked on return.",
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "handover.confirmed",
      entityType: "booking",
      entityId: booking.id,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  return serializeHandover(updated);
}

export async function completeHandover(userId: string, handoverId: string, ctx: RequestContext) {
  const { merchant, booking, handover } = await requireOwnHandover(userId, handoverId);
  await requireHandoverNotExpired(handover);
  if (handover.state !== "confirmed") conflict("not_confirmed", "Confirm the handover before completing it.");

  const now = new Date();
  const bookingUpdate: Partial<BookingRow> =
    handover.kind === "pickup"
      ? { status: "active" }
      : {
          status: "completed",
          returned_at: now,
          deposit_release_at: new Date(now.getTime() + DEPOSIT_HOLD_HOURS * 60 * 60 * 1000),
          rating_open_until: new Date(now.getTime() + RATING_WINDOW_DAYS * 24 * 60 * 60 * 1000),
        };

  const [updatedBooking, updatedHandover] = await db.transaction(async (trx) => {
    const [handoverRow] = await trx<HandoverRow>("handovers")
      .where({ id: handover.id })
      .update({ state: "completed", completed_at: now })
      .returning("*");
    if (!handoverRow) throw new Error("Failed to complete handover");

    const [bookingRow] = await trx<BookingRow>("bookings").where({ id: booking.id }).update(bookingUpdate).returning("*");
    if (!bookingRow) throw new Error("Failed to update booking");

    await appendBookingEvent(trx, {
      bookingId: booking.id,
      merchantId: merchant.id,
      kind: handover.kind === "pickup" ? "vehicle_handed_over" : "vehicle_returned",
      tone: "green",
      label: handover.kind === "pickup" ? "Vehicle handed over" : "Vehicle returned",
      body:
        handover.kind === "pickup"
          ? "Checked over together at pick-up."
          : "Checked over on return. Deposit clears in 24 hours unless a report is filed.",
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: handover.kind === "pickup" ? "booking.activated" : "booking.completed",
      entityType: "booking",
      entityId: booking.id,
      after: { status: bookingUpdate.status },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return [bookingRow, handoverRow] as const;
  });

  const [vehicle, hirer] = await Promise.all([vehicleOf(updatedBooking.vehicle_id), hirerInfoOf(updatedBooking.hirer_id)]);
  return { booking: await serializeDetail(updatedBooking, vehicle, hirer), handover: serializeHandover(updatedHandover) };
}

// ---------------------------------------------------------------------
// Reports (deposit-backed claim, or a no-money conduct report)
// ---------------------------------------------------------------------

function serializeReport(r: BookingReportRow) {
  return {
    id: r.id,
    booking_id: r.booking_id,
    kind: r.kind,
    category: r.category,
    description: r.description,
    amount: money(r.amount_amount, r.amount_currency),
    evidence_document_ids: r.evidence_document_ids,
    status: r.status,
    escalated_dispute_id: r.escalated_dispute_id,
    filed_at: r.created_at.toISOString(),
  };
}

export async function listBookingReports(userId: string, bookingId: string) {
  const { booking } = await requireOwnBooking(userId, bookingId);
  const reports = await db<BookingReportRow>("booking_reports").where({ booking_id: booking.id }).orderBy("created_at", "desc");
  return { data: reports.map(serializeReport) };
}

function reportWindowOk(booking: BookingRow): boolean {
  if (booking.status === "active") return true;
  if (booking.status !== "completed" || !booking.returned_at) return false;
  // 14-day reportable window from the actual return moment — a real
  // column, not back-computed from deposit_release_at (which now moves
  // independently: filing a claim extends it from 24h to 48h below).
  return Date.now() <= booking.returned_at.getTime() + REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function claimableNow(booking: BookingRow): boolean {
  return booking.status === "completed" && !booking.deposit_released && !!booking.deposit_release_at && Date.now() < booking.deposit_release_at.getTime();
}

export async function createBookingReport(userId: string, bookingId: string, input: CreateBookingReportInput, ctx: RequestContext) {
  const { merchant, booking } = await requireOwnBooking(userId, bookingId);

  if (!reportWindowOk(booking)) {
    conflict("report_window_closed", "Reports can only be filed while a booking is on hire or within 14 days of its return.");
  }
  if (input.category === "damage" && !booking.has_pickup_condition_photos) {
    unprocessable("photos_required", "No pickup condition photos are on file for this booking, so a damage claim can't be filed.");
  }

  let amount: Money | null = null;
  let escalatedDisputeId: string | null = null;
  if (input.kind === "claim") {
    if (!claimableNow(booking)) {
      conflict("deposit_not_held", "The deposit for this booking is no longer held, so a claim can't move money now.");
    }
    const requested = input.amount!;
    const cap = booking.deposit_amount;
    amount = kes(Math.min(requested, cap));
    if (requested > cap) escalatedDisputeId = generateId("dispute");
  }

  const report = await db.transaction(async (trx) => {
    const [row] = await trx<BookingReportRow>("booking_reports")
      .insert({
        id: generateId("bookingReport"),
        booking_id: booking.id,
        merchant_id: merchant.id,
        kind: input.kind,
        category: input.category,
        description: input.description,
        amount_amount: amount?.amount ?? null,
        amount_currency: amount?.currency ?? null,
        evidence_document_ids: input.evidence_document_ids ?? [],
        escalated_dispute_id: escalatedDisputeId,
      })
      .returning("*");
    if (!row) throw new Error("Failed to file report");

    if (input.kind === "claim" && booking.returned_at) {
      const extendedRelease = new Date(booking.returned_at.getTime() + CLAIM_DEPOSIT_HOLD_HOURS * 60 * 60 * 1000);
      await trx<BookingRow>("bookings").where({ id: booking.id }).update({ deposit_release_at: extendedRelease });
      await appendBookingEvent(trx, {
        bookingId: booking.id,
        merchantId: merchant.id,
        kind: "deposit_hold_extended",
        tone: "amber",
        label: "Deposit hold extended to 48 hours",
        body: "A claim was filed, so CRAL is holding the deposit longer while it's reviewed.",
        actorType: "system",
      });
    }

    await appendBookingEvent(trx, {
      bookingId: booking.id,
      merchantId: merchant.id,
      kind: input.kind === "claim" ? "claim_filed" : "conduct_reported",
      tone: "amber",
      label: input.kind === "claim" ? "Claim filed against the deposit" : "Conduct reported",
      body: input.description,
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "booking.report_filed",
      entityType: "booking",
      entityId: booking.id,
      after: { kind: input.kind, category: input.category, amount },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return row;
  });

  return serializeReport(report);
}

// ---------------------------------------------------------------------
// Hirer-history drawer
// ---------------------------------------------------------------------

export async function getHirerHistory(userId: string, bookingId: string) {
  const { booking } = await requireOwnBooking(userId, bookingId);
  const [user, allBookings] = await Promise.all([
    db("users").where({ id: booking.hirer_id }).first(),
    db<BookingRow>("bookings").where({ hirer_id: booking.hirer_id }),
  ]);

  const completed = allBookings.filter((b) => b.status === "completed");
  const cancelled = allBookings.filter((b) => b.status === "cancelled");

  return {
    name: user?.full_name ?? "Hirer",
    // No hirer ID-verification pipeline exists yet — no admin review, no
    // document check, nothing to key a ✓ badge off. A hardcoded `true`
    // here was a fabricated trust signal on a product whose whole thesis
    // is that verification state is legible and real; omit the field
    // entirely rather than lie with it until it's actually implemented.
    member_since: (user?.created_at ?? booking.created_at).toISOString().slice(0, 10),
    trip_count: allBookings.length,
    average_rating: null, // no rating-of-hirers-by-other-merchants aggregation built yet
    completed_count: completed.length,
    late_return_count: 0, // not tracked yet — no column distinguishes an on-time vs late return
    cancellation_count: cancelled.length,
    licence_valid_to: null, // hirer driving-licence data isn't modeled yet (no customer-document table)
  };
}

// ---------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------

export async function rateHirer(userId: string, bookingId: string, input: RateHirerInput, ctx: RequestContext) {
  const { merchant, booking } = await requireOwnBooking(userId, bookingId);
  if (booking.status !== "completed") conflict("booking_not_completed", "Only a completed booking can be rated.");
  if (!booking.rating_open_until || booking.rating_open_until.getTime() < Date.now()) {
    conflict("rating_window_closed", "The 14-day rating window for this booking has closed.");
  }

  const existing = await db<BookingEventRow>("booking_events").where({ booking_id: booking.id, kind: "rated" }).first();
  if (existing) conflict("already_rated", "You've already rated this hirer for this booking.");

  const [vehicle, hirer] = await Promise.all([vehicleOf(booking.vehicle_id), hirerInfoOf(booking.hirer_id)]);

  await db.transaction(async (trx) => {
    await appendBookingEvent(trx, {
      bookingId: booking.id,
      merchantId: merchant.id,
      kind: "rated",
      tone: "grey",
      label: `You rated ${hirer.full_name} ${input.stars}/5`,
      body: input.comment ?? null,
      actorType: "merchant",
    });
    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "booking.hirer_rated",
      entityType: "booking",
      entityId: booking.id,
      after: { stars: input.stars },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  return serializeDetail(booking, vehicle, hirer);
}

// ---------------------------------------------------------------------
// Background: expire unanswered requests (spec §14's 12h response window)
// ---------------------------------------------------------------------

export async function expireStaleBookingRequests(): Promise<number> {
  const stale = await db<BookingRow>("bookings")
    .where({ status: "requested" })
    .whereNotNull("response_due_at")
    .where("response_due_at", "<", new Date());

  for (const booking of stale) {
    await db.transaction(async (trx) => {
      const updatedRows = await trx<BookingRow>("bookings")
        .where({ id: booking.id, status: "requested" }) // re-check status inside the txn in case it was just answered
        .update({
          status: "expired",
          refund_amount: booking.gross_amount,
          refund_currency: booking.gross_currency,
          commission_amount: 0,
          merchant_net_amount: 0,
        });
      // The merchant answered between the initial scan and this
      // transaction — the WHERE matched 0 rows, so nothing actually
      // changed. Skip the event/audit writes too, or the timeline would
      // permanently show a false "Request expired" on a booking that was
      // in fact accepted or declined in time.
      if (updatedRows === 0) return;
      await appendBookingEvent(trx, {
        bookingId: booking.id,
        merchantId: booking.merchant_id,
        kind: "expired",
        tone: "grey",
        label: "Request expired",
        body: "No answer within 12 hours. The hirer has been refunded in full.",
        actorType: "system",
      });
      await writeAuditEntry(trx, {
        actorId: null,
        actorType: "system",
        action: "booking.expired",
        entityType: "booking",
        entityId: booking.id,
        before: { status: "requested" },
        after: { status: "expired" },
      });
    });
  }
  return stale.length;
}

export { RESPONSE_WINDOW_HOURS };

import { ulid } from "ulid";
import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { normalizePhone } from "../../lib/identifier.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { paymentAdapter } from "../../lib/adapters.js";
import type { BookingRow } from "../bookings/db-types.js";

export interface RequestContext {
  ip: string | null;
  requestId: string | null;
}

export interface PaymentRequestRow {
  id: string;
  booking_id: string;
  purpose: "deposit" | "full";
  amount_amount: number;
  amount_currency: string;
  phone: string;
  status: "pending" | "success" | "failed" | "cancelled";
  provider: string;
  provider_request_id: string | null;
  provider_receipt: string | null;
  raw_callback: unknown;
  failure_reason: string | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

const STK_EXPIRY_MINUTES = 5;

function amountFor(booking: BookingRow, purpose: "deposit" | "full"): number {
  return purpose === "deposit" ? booking.deposit_amount : booking.gross_amount;
}

/** A renter initiating M-Pesa payment on their own booking. */
export async function initiatePayment(
  userId: string,
  bookingId: string,
  input: { purpose: "deposit" | "full"; phone: string },
  ctx: RequestContext,
): Promise<{ payment_request_id: string; status: string }> {
  const booking = await db<BookingRow>("bookings").where({ id: bookingId, hirer_id: userId }).first();
  if (!booking) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "booking_not_found",
      message: "That booking doesn't exist on your account.",
    });
  }

  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "invalid_phone",
      message: "That doesn't look like a valid phone number.",
      field: "phone",
    });
  }

  // Ours, generated before the call — Co-op's `MessageReference`, echoed
  // back verbatim in both the sync ack and the async callback, so this is
  // what the callback handler matches on (never a provider-issued id, see
  // coopbank-adapter.ts). A raw ulid() is 26 chars, within the field's
  // 27-char max; a prefixed id (e.g. "pay_...") would not fit.
  const messageReference = ulid();
  const amountCents = amountFor(booking, input.purpose);
  const result = await paymentAdapter.initiateStkPush({
    messageReference,
    phone,
    amountCents,
    narration: `CRAL ${booking.ref}`,
  });

  const row = await db.transaction(async (trx) => {
    const [inserted] = await trx<PaymentRequestRow>("payment_requests")
      .insert({
        id: generateId("payment"),
        booking_id: booking.id,
        purpose: input.purpose,
        amount_amount: amountCents,
        amount_currency: "KES",
        phone,
        status: "pending",
        provider: "coopbank",
        provider_request_id: messageReference,
        expires_at: new Date(Date.now() + STK_EXPIRY_MINUTES * 60 * 1000),
      })
      .returning("*");
    if (!inserted) throw new Error("Failed to record payment request");

    await writeAuditEntry(trx, {
      actorType: "user",
      actorId: userId,
      action: "payment.initiated",
      entityType: "booking",
      entityId: booking.id,
      after: {
        payment_request_id: inserted.id,
        purpose: input.purpose,
        amount_amount: amountCents,
        provider_ref: result.providerRef,
      },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });

    return inserted;
  });

  return { payment_request_id: row.id, status: row.status };
}

interface CoopBankCallbackBody {
  MessageReference?: string;
  MessageCode?: string;
  MessageDescription?: string;
  TelcoRef?: string;
  /** The real M-Pesa transaction reference — what a renter would recognise from their own M-Pesa message. */
  TransactionID?: string;
}

/**
 * Co-op Bank's async callback — confirmed against their OpenAPI document
 * for the STKPush resource (2026-09-14, see coopbank-adapter.ts's own
 * comment for the full shape). `MessageReference` is what correlates this
 * to a `payment_requests` row: it's a value WE generated and sent on the
 * initiate call, echoed back here verbatim — not a provider-issued id.
 * `MessageCode: "0"` is success.
 *
 * NOT CONFIRMED: how this callback authenticates itself (no signature,
 * secret or IP range documented) — see routes.ts's own note. This parser
 * being right does not make the endpoint safe to point real money at.
 *
 * Idempotent by construction: `provider_request_id` is unique, and a
 * second callback for an already-decided row is a no-op rather than a
 * double-credit.
 */
export async function handleCallback(rawBody: unknown, ctx: RequestContext): Promise<void> {
  const body = rawBody as CoopBankCallbackBody;
  if (typeof body?.MessageReference !== "string" || typeof body?.MessageCode !== "string") {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "unrecognised_callback_shape",
      message: "Callback payload didn't match the expected Co-op Bank STKPush shape.",
    });
  }

  const messageReference = body.MessageReference;
  const succeeded = body.MessageCode === "0";
  const description = typeof body.MessageDescription === "string" ? body.MessageDescription : null;
  const receipt = typeof body.TransactionID === "string" ? body.TransactionID : null;

  await db.transaction(async (trx) => {
    const existing = await trx<PaymentRequestRow>("payment_requests")
      .where({ provider_request_id: messageReference })
      .forUpdate()
      .first();
    if (!existing) {
      // Not one of ours, or already purged — nothing to update, and
      // returning 200 keeps the provider from retrying indefinitely.
      return;
    }
    if (existing.status !== "pending") return; // already decided — idempotent no-op

    await trx<PaymentRequestRow>("payment_requests")
      .where({ id: existing.id })
      .update({
        status: succeeded ? "success" : "failed",
        provider_receipt: succeeded ? receipt : null,
        failure_reason: succeeded ? null : description,
        raw_callback: JSON.stringify(rawBody),
      });

    if (succeeded) {
      await trx<BookingRow>("bookings")
        .where({ id: existing.booking_id })
        .update({ payment_request_id: existing.id });
    }

    await writeAuditEntry(trx, {
      actorType: "system",
      actorId: "coopbank-callback",
      action: succeeded ? "payment.succeeded" : "payment.failed",
      entityType: "booking",
      entityId: existing.booking_id,
      after: { payment_request_id: existing.id, message_code: body.MessageCode, message_description: description },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
  });
}

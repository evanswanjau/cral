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

  const amountCents = amountFor(booking, input.purpose);
  const result = await paymentAdapter.initiateStkPush({
    phone,
    amountCents,
    accountReference: booking.ref,
    transactionDesc: `CRAL booking ${booking.ref}`,
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
        provider_request_id: result.providerRequestId,
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
      after: { payment_request_id: inserted.id, purpose: input.purpose, amount_amount: amountCents },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });

    return inserted;
  });

  return { payment_request_id: row.id, status: row.status };
}

/**
 * Co-op Bank's async callback. NOT CONFIRMED against their actual payload -
 * written Daraja-shaped (`Body.stkCallback.{MerchantRequestID,
 * CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata}`) as the
 * only reasonable default for a proxy named SafaricomSTKPush. Update this
 * parser alongside coopbank-adapter.ts once the real shape is confirmed.
 *
 * Idempotent by construction: `provider_request_id` is unique, and a
 * second callback for an already-decided row is a no-op rather than a
 * double-credit.
 */
export async function handleCallback(rawBody: unknown, ctx: RequestContext): Promise<void> {
  const callback = (rawBody as { Body?: { stkCallback?: Record<string, unknown> } })?.Body
    ?.stkCallback;
  if (!callback || typeof callback.CheckoutRequestID !== "string") {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "unrecognised_callback_shape",
      message: "Callback payload didn't match the expected stkCallback shape.",
    });
  }

  const checkoutRequestId = callback.CheckoutRequestID;
  const resultCode = callback.ResultCode;
  const resultDesc = typeof callback.ResultDesc === "string" ? callback.ResultDesc : null;

  const items = (
    callback.CallbackMetadata as { Item?: { Name: string; Value: unknown }[] } | undefined
  )?.Item;
  const receipt = items?.find((i) => i.Name === "MpesaReceiptNumber")?.Value;

  await db.transaction(async (trx) => {
    const existing = await trx<PaymentRequestRow>("payment_requests")
      .where({ provider_request_id: checkoutRequestId })
      .forUpdate()
      .first();
    if (!existing) {
      // Not one of ours, or already purged — nothing to update, and
      // returning 200 keeps the provider from retrying indefinitely.
      return;
    }
    if (existing.status !== "pending") return; // already decided — idempotent no-op

    const succeeded = resultCode === 0 || resultCode === "0";
    await trx<PaymentRequestRow>("payment_requests")
      .where({ id: existing.id })
      .update({
        status: succeeded ? "success" : "failed",
        provider_receipt: succeeded && typeof receipt === "string" ? receipt : null,
        failure_reason: succeeded ? null : resultDesc,
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
      after: { payment_request_id: existing.id, result_code: resultCode, result_desc: resultDesc },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
  });
}

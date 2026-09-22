import { ulid } from "ulid";
import { ApiError, kes, type Money } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { normalizePhone } from "../../lib/identifier.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { paymentAdapter } from "../../lib/adapters.js";
import type { ParsedCallback } from "../../adapters/payment/index.js";
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

  /**
   * **The owner accepts first, then the renter pays** (owner's call,
   * 2026-09-21 - reverses the 2026-09-20 call that had moved payment
   * ahead of the owner's answer, restoring the original 2026-09-19
   * gate). A `requested` booking is not payable: nobody holds those
   * dates yet, and taking money for a hire an owner may decline is what
   * created the refund obligation in the first place.
   *
   * Every other status is refused for the same reason - paying a
   * `declined`, `expired` or `cancelled` booking is money for dates
   * nobody holds. `active` is payable so a hire that started on a failed
   * prompt can still settle.
   *
   * The "only once" half of the guard is unchanged - see the
   * `already_paid` check below.
   */
  if (booking.status !== "confirmed" && booking.status !== "active") {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "booking_not_payable",
      message:
        booking.status === "requested"
          ? "Wait for the owner to accept this request before paying."
          : `A ${booking.status} booking can't be paid.`,
    });
  }
  const settled = await db<PaymentRequestRow>("payment_requests")
    .where({ booking_id: booking.id })
    .whereIn("status", ["pending", "success"])
    .orderBy("created_at", "desc")
    .first();
  if (settled?.status === "success") {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "already_paid",
      message: "This booking is already paid.",
    });
  }
  // An in-flight prompt that hasn't expired yet is returned as-is rather
  // than pushing a second prompt at the same phone.
  if (settled?.status === "pending" && settled.expires_at.getTime() > Date.now()) {
    return { payment_request_id: settled.id, status: settled.status };
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

  // Ours, generated before the call. A raw ulid() is 26 chars, inside
  // Co-op's 27-char `MessageReference` limit; a prefixed id (e.g.
  // "pay_...") would not fit.
  const messageReference = ulid();
  const amountCents = amountFor(booking, input.purpose);

  /**
   * **The row is written before the prompt goes out** (2026-09-22, with
   * the Daraja adapter). It used to be the other way round - push first,
   * insert after - which had two problems:
   *
   * 1. If the push succeeded and the insert then failed, the renter was
   *    charged and no row existed at all. Nothing could settle that
   *    payment, or even show it had happened. That is the worst failure
   *    available here, and ordering it this way removes it.
   * 2. Daraja issues its own correlator (`CheckoutRequestID`) rather than
   *    echoing ours, so the row has to exist to be stamped with it.
   *
   * The cost is an orphan `pending` row when the push itself throws,
   * which the catch below marks `failed` - and `expires_at` would retire
   * anyway. A `failed` row doesn't block a retry; only `pending` and
   * `success` do.
   */
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
        provider: process.env.PAYMENT_ADAPTER ?? "console",
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
      },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });

    return inserted;
  });

  let result;
  try {
    result = await paymentAdapter.initiateStkPush({
      messageReference,
      phone,
      amountCents,
      narration: `CRAL ${booking.ref}`,
    });
  } catch (err) {
    await db<PaymentRequestRow>("payment_requests")
      .where({ id: row.id })
      .update({
        status: "failed",
        failure_reason: err instanceof Error ? err.message : "The prompt could not be sent.",
      });
    throw err;
  }

  /**
   * Re-stamp the correlator for a provider that issues its own. See
   * `PaymentAdapter.correlatesOn` - for Daraja this is the only value the
   * callback carries back, so a row still holding our ulid could never be
   * matched. For Co-op this is a no-op: it echoes what we sent.
   *
   * There is a window here where a callback could land before the stamp.
   * It isn't reachable in practice - the ack returns before Safaricom has
   * even drawn the PIN prompt, let alone had it answered - and the
   * alternative (inventing a correlator the provider doesn't accept) is
   * not available.
   */
  if (paymentAdapter.correlatesOn === "provider" && result.providerRef) {
    await db<PaymentRequestRow>("payment_requests")
      .where({ id: row.id })
      .update({ provider_request_id: result.providerRef });
  }

  return { payment_request_id: row.id, status: row.status };
}

/**
 * Applies a provider's async result to the booking it belongs to.
 *
 * **The wire format is the adapter's business, the settle rules are
 * this function's** (2026-09-22, when Daraja landed beside Co-op).
 * `paymentAdapter.parseCallback` reduces whatever arrived to a
 * `ParsedCallback`; everything below is one copy of the rules, applied
 * the same way whichever rail is live. A second copy per provider is how
 * two rails drift apart.
 *
 * Idempotent by construction: `provider_request_id` is unique, and a
 * second callback for an already-decided row is a no-op rather than a
 * double-credit.
 *
 * Returns quietly for a payload this adapter doesn't recognise. Each
 * provider has its own callback URL, and a body arriving at the wrong one
 * - or from the rail that is no longer configured - must be ignored, not
 * made to 500 and invite a retry loop.
 */
export async function handleCallback(rawBody: unknown, ctx: RequestContext): Promise<void> {
  const parsed = paymentAdapter.parseCallback(rawBody);
  if (!parsed) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "unrecognised_callback_shape",
      message: "Callback payload didn't match the configured provider's shape.",
    });
  }

  await applySettlement(parsed, rawBody, ctx);
}

/**
 * The settle rules themselves - one copy, independent of any provider's
 * wire format. `handleCallback` reaches here once the adapter has
 * reduced its own callback body to a `ParsedCallback`.
 *
 * Kept separate from `handleCallback` rather than inlined into it: the
 * split is what lets a second rail be added by writing a `parseCallback`
 * and nothing else. A copy of these rules per provider is how two rails
 * come to disagree about what "paid" means.
 *
 * It had a second caller, `devSettlePayment`, until that was removed on
 * 2026-09-22 with the rest of the dev settler - see CLAUDE.md.
 */
async function applySettlement(
  parsed: ParsedCallback,
  rawBody: unknown,
  ctx: RequestContext,
): Promise<void> {
  await db.transaction(async (trx) => {
    const existing = await trx<PaymentRequestRow>("payment_requests")
      .where({ provider_request_id: parsed.reference })
      .forUpdate()
      .first();
    if (!existing) {
      // Not one of ours, or already purged - nothing to update, and
      // returning 200 keeps the provider from retrying indefinitely.
      return;
    }
    if (existing.status !== "pending") return; // already decided - idempotent no-op

    /**
     * **A success has to be for the right amount.** The callback endpoint
     * is unauthenticated at the network level for at least one provider
     * (see routes.ts), so `provider_request_id` alone is a weak claim: it
     * is guessable in principle, and anything that learned one could
     * otherwise mark a booking paid. Checking the figure the provider
     * says it took against the figure we asked for closes the gap that
     * actually matters - being credited for money nobody sent.
     *
     * Recorded as `failed` rather than ignored: a real mismatch means
     * something is wrong that a human needs to see, and leaving the row
     * `pending` would just let it expire silently.
     */
    const expectedShillings = Math.round(existing.amount_amount / 100);
    const amountMismatch =
      parsed.succeeded &&
      parsed.amountShillings !== null &&
      parsed.amountShillings !== expectedShillings;

    const succeeded = parsed.succeeded && !amountMismatch;

    await trx<PaymentRequestRow>("payment_requests")
      .where({ id: existing.id })
      .update({
        status: succeeded ? "success" : "failed",
        provider_receipt: succeeded ? parsed.receipt : null,
        failure_reason: amountMismatch
          ? `Provider reported KES ${parsed.amountShillings} against an expected KES ${expectedShillings}.`
          : succeeded
            ? null
            : parsed.failureReason,
        raw_callback: JSON.stringify(rawBody),
      });

    if (succeeded) {
      await trx<BookingRow>("bookings")
        .where({ id: existing.booking_id })
        .update({ payment_request_id: existing.id });
    }

    await writeAuditEntry(trx, {
      actorType: "system",
      actorId: `${existing.provider}-callback`,
      action: amountMismatch
        ? "payment.amount_mismatch"
        : succeeded
          ? "payment.succeeded"
          : "payment.failed",
      entityType: "booking",
      entityId: existing.booking_id,
      after: {
        payment_request_id: existing.id,
        succeeded,
        receipt: succeeded ? parsed.receipt : null,
        failure_reason: parsed.failureReason,
        ...(amountMismatch
          ? { expected_shillings: expectedShillings, reported_shillings: parsed.amountShillings }
          : {}),
      },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
  });
}

/**
 * The renter polling their own booking's payment while the Co-op callback
 * lands - and, just as importantly, what a *reloaded* page reads to find
 * out where it actually got to. Before this existed the client had no way
 * to recover payment state across a refresh, so a reload mid-prompt
 * looked like "never paid" (2026-09-19).
 *
 * `null` means no prompt has ever been sent for this booking. A `pending`
 * row past its `expires_at` is reported as `expired` rather than left
 * looking live for ever.
 */
export async function getPaymentState(
  userId: string,
  bookingId: string,
): Promise<{
  status: "none" | "pending" | "success" | "failed" | "cancelled" | "expired";
  amount: Money | null;
  phone: string | null;
  receipt: string | null;
  failure_reason: string | null;
  expires_at: string | null;
}> {
  const booking = await db<BookingRow>("bookings").where({ id: bookingId, hirer_id: userId }).first();
  if (!booking) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "booking_not_found",
      message: "That booking doesn't exist on your account.",
    });
  }
  const row = await db<PaymentRequestRow>("payment_requests")
    .where({ booking_id: booking.id })
    .orderBy("created_at", "desc")
    .first();
  if (!row) {
    return { status: "none", amount: null, phone: null, receipt: null, failure_reason: null, expires_at: null };
  }
  const expired = row.status === "pending" && row.expires_at.getTime() <= Date.now();
  return {
    status: expired ? "expired" : row.status,
    amount: kes(row.amount_amount),
    phone: row.phone,
    receipt: row.provider_receipt,
    failure_reason: row.failure_reason,
    expires_at: row.expires_at.toISOString(),
  };
}

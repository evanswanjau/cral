import type { Knex } from "knex";
import { db } from "../db/client.js";
import { generateId } from "./ids.js";
import { writeAuditEntry } from "./audit.js";
import { paymentAdapter } from "./adapters.js";

/**
 * Sending a renter's money back.
 *
 * Built for the 2026-09-20 call that moved payment ahead of the owner's
 * decision. That call was reversed on 2026-09-21 - a renter pays only
 * after acceptance - so the common case is now nothing to refund, and
 * `recordRefund` returns null rather than writing a row.
 *
 * It is deliberately kept, not deleted. A merchant cancelling a booking
 * they already accepted and were paid for owes the money back; so does
 * any booking taken under the brief pay-first flow. `bookings.refund_
 * amount` alone is bookkeeping, not a refund.
 *
 * Shaped like `notify()` and `writeAuditEntry`: the obligation is
 * recorded inside the caller's own transaction, and the actual send is
 * attempted only after that transaction commits. A provider timeout must
 * not roll back the decline that caused it - the same reasoning as the
 * payout-query email and the notification-delivery enqueue.
 */

export type RefundReason = "declined" | "expired" | "merchant_cancelled" | "hirer_cancelled";

export interface RefundRow {
  id: string;
  booking_id: string;
  payment_request_id: string;
  amount_amount: number;
  amount_currency: string;
  phone: string;
  reason: RefundReason;
  status: "pending" | "success" | "failed";
  provider: string;
  provider_ref: string | null;
  failure_reason: string | null;
}

/**
 * Records what is owed, in the caller's transaction. Returns the refund
 * id to hand to `executeRefund` after commit, or null when there is
 * nothing to refund - an unpaid booking is the normal case for a request
 * the owner turned down inside the window, and must not create a row.
 *
 * Idempotent on `(booking_id, reason)`: the unique index is what makes a
 * double-refund impossible under concurrency, not this lookup.
 */
export async function recordRefund(
  trx: Knex.Transaction,
  input: {
    bookingId: string;
    reason: RefundReason;
    actorId: string | null;
    requestId: string | null;
    ip: string | null;
    /**
     * Partial refund, in cents. A merchant cancelling after the pickup
     * hour keeps a 25% fee, so the renter gets the balance back, not the
     * whole payment. Omitted means refund everything that came in.
     * Clamped to the payment - a refund can never exceed it.
     */
    amountCents?: number;
  },
): Promise<string | null> {
  const payment = (await trx("payment_requests")
    .where({ booking_id: input.bookingId, status: "success" })
    .orderBy("created_at", "desc")
    .first()) as
    | { id: string; amount_amount: number; amount_currency: string; phone: string; provider: string }
    | undefined;
  if (!payment) return null;

  const amount = Math.max(0, Math.min(input.amountCents ?? payment.amount_amount, payment.amount_amount));
  // Nothing owed (a full late-cancellation fee, say) is not a refund.
  if (amount === 0) return null;

  const id = generateId("refund");
  const [row] = (await trx("refunds")
    .insert({
      id,
      booking_id: input.bookingId,
      payment_request_id: payment.id,
      amount_amount: amount,
      amount_currency: payment.amount_currency,
      phone: payment.phone,
      reason: input.reason,
      status: "pending",
      provider: payment.provider,
    })
    .onConflict(["booking_id", "reason"])
    .ignore()
    .returning("id")) as Array<{ id: string }>;

  // `ignore()` returns nothing when the row already existed - this
  // booking was already refunded for this reason, so there is no second
  // obligation and nothing to send.
  if (!row) return null;

  await writeAuditEntry(trx, {
    actorId: input.actorId,
    actorType: input.actorId ? "user" : "system",
    action: "refund.recorded",
    entityType: "booking",
    entityId: input.bookingId,
    after: { refund_id: id, reason: input.reason, amount },
    requestId: input.requestId,
    ip: input.ip,
  });

  return id;
}

/**
 * Attempts the send, after the caller's transaction has committed.
 *
 * Never throws. A failed refund is a `failed` row carrying the reason,
 * for a human to settle by hand - and today that is the *expected*
 * outcome in production, because the Co-op adapter has no confirmed
 * reversal endpoint and throws on purpose. Letting this bubble would
 * turn "we owe you money" into a 500 on the merchant's decline button,
 * which helps nobody and loses the record.
 */
export async function executeRefund(refundId: string, bookingRef: string): Promise<void> {
  const refund = (await db("refunds").where({ id: refundId }).first()) as RefundRow | undefined;
  if (!refund || refund.status !== "pending") return;

  const original = (await db("payment_requests")
    .where({ id: refund.payment_request_id })
    .first()) as { provider_receipt: string | null } | undefined;

  try {
    const result = await paymentAdapter.refund({
      messageReference: refund.id,
      phone: refund.phone,
      amountCents: refund.amount_amount,
      narration: `Refund ${bookingRef}`.slice(0, 30),
      originalReceipt: original?.provider_receipt ?? null,
    });
    await db("refunds")
      .where({ id: refund.id })
      .update({ status: "success", provider_ref: result.providerRef, updated_at: new Date() });
  } catch (err) {
    await db("refunds")
      .where({ id: refund.id })
      .update({
        status: "failed",
        failure_reason: err instanceof Error ? err.message : String(err),
        updated_at: new Date(),
      });
  }
}

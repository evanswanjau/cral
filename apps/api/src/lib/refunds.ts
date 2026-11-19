import type { Knex } from "knex";
import { db } from "../db/client.js";
import { generateId } from "./ids.js";
import { writeAuditEntry } from "./audit.js";
import { createRefundDisbursement, sendDisbursement } from "./disbursements.js";

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

/**
 * Why a garage order's payment goes back (Phase 4 GS3):
 * `order_duplicate` - a second payment landed for a quote already paid;
 * `order_closed` - money arrived for an order that was cancelled first;
 * `order_refunded` - Ops upheld the customer's problem.
 */
export type OrderRefundReason = "order_duplicate" | "order_closed" | "order_refunded";

export interface RefundRow {
  id: string;
  booking_id: string | null;
  order_id: string | null;
  payment_request_id: string;
  amount_amount: number;
  amount_currency: string;
  phone: string;
  reason: RefundReason | OrderRefundReason;
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
 * A garage order's refund of one payment, in the caller's transaction.
 * An order can carry two payments (the original quote and an extra-work
 * quote), so the obligation is per payment: the partial unique index on
 * `(payment_request_id, reason)` is what makes a double-refund impossible.
 * Returns the refund id for `executeRefund` after commit, or null when this
 * payment was already refunded for this reason.
 */
export async function recordOrderRefund(
  trx: Knex.Transaction,
  input: {
    orderId: string;
    paymentRequestId: string;
    reason: OrderRefundReason;
    actorId: string | null;
    actorType?: "user" | "admin" | "system";
    requestId: string | null;
    ip: string | null;
  },
): Promise<string | null> {
  const payment = (await trx("payment_requests")
    .where({ id: input.paymentRequestId, order_id: input.orderId, status: "success" })
    .first()) as
    | { id: string; amount_amount: number; amount_currency: string; phone: string; provider: string }
    | undefined;
  if (!payment) return null;

  const id = generateId("refund");
  // Raw for the partial index's arbiter (`WHERE order_id IS NOT NULL`).
  const inserted = await trx.raw<{ rows: Array<{ id: string }> }>(
    `INSERT INTO refunds
       (id, booking_id, order_id, payment_request_id, amount_amount, amount_currency, phone, reason, status, provider, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'pending', ?, now(), now())
     ON CONFLICT (payment_request_id, reason) WHERE order_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [id, input.orderId, payment.id, payment.amount_amount, payment.amount_currency, payment.phone, input.reason, payment.provider],
  );
  const row = inserted.rows[0];
  if (!row) return null;

  await writeAuditEntry(trx, {
    actorId: input.actorId,
    actorType: input.actorType ?? (input.actorId ? "user" : "system"),
    action: "refund.recorded",
    entityType: "order",
    entityId: input.orderId,
    after: { refund_id: id, reason: input.reason, amount: payment.amount_amount, payment_request_id: payment.id },
    requestId: input.requestId,
    ip: input.ip,
  });
  return id;
}

/**
 * Sends the refund, after the caller's transaction has committed, by Send
 * to M-Pesa through `lib/disbursements.ts` - the same rail as merchant
 * payouts. The refund row stays `pending` until that attempt settles; the
 * disbursement's callback / status lookup moves it to `success` or
 * `failed`.
 *
 * Never throws. A refund that can't be started (no usable phone on the
 * payment) is marked `failed` with the reason, for a human to settle by
 * hand - letting it bubble would turn "we owe you money" into a 500 on the
 * merchant's decline button, which helps nobody and loses the record.
 */
export async function executeRefund(refundId: string, bookingRef: string): Promise<void> {
  const refund = (await db("refunds").where({ id: refundId }).first()) as RefundRow | undefined;
  if (!refund || refund.status !== "pending") return;

  let disbursementId: string;
  try {
    disbursementId = await db.transaction((trx) => createRefundDisbursement(trx, refund.id));
  } catch (err) {
    await db("refunds")
      .where({ id: refund.id })
      .update({
        status: "failed",
        failure_reason: err instanceof Error ? err.message : String(err),
        updated_at: new Date(),
      });
    return;
  }
  await sendDisbursement(disbursementId, `Refund ${bookingRef}`);
}

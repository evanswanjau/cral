import type { Knex } from "knex";
import { db } from "../../db/client.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { notify } from "../../lib/notifications.js";
import { recordOrderRefund } from "../../lib/refunds.js";
import type { OrderRow } from "./orders.js";
import type { QuoteRow } from "./service.js";

/**
 * What a settled payment does to a garage order (Phase 4 GS3). Called only
 * from `modules/payments/service.ts#applySettlement`, inside its
 * transaction, after it has matched the row, checked the amount and marked
 * the payment `success`. Those settle rules are not repeated here; this is
 * the order's side of a payment that has already been accepted as real.
 *
 * Imports nothing from `modules/payments` so the two modules don't import
 * each other.
 *
 * Money that can't be applied is never kept: a second success for a quote
 * already paid (two prompts both answered) or money for an order that was
 * cancelled while its prompt was open is recorded as a refund here and sent
 * by the caller after commit.
 */
export interface SettledOrderPayment {
  id: string;
  order_id: string | null;
  quote_id: string | null;
  amount_amount: number;
  provider: string;
}

export interface OrderPaymentOutcome {
  refundId: string | null;
  /** A merchant feed row to deliver after commit. */
  merchantNotice: { merchantId: string; id: string } | null;
}

const kesText = (cents: number) => `KES ${Math.round(cents / 100).toLocaleString("en-KE")}`;

export async function applyOrderPayment(
  trx: Knex.Transaction,
  payment: SettledOrderPayment,
  ctx: { ip: string | null; requestId: string | null },
): Promise<OrderPaymentOutcome> {
  const none: OrderPaymentOutcome = { refundId: null, merchantNotice: null };
  if (!payment.order_id || !payment.quote_id) return none;

  // Lock the order first, then the quote, the same order every writer uses.
  const order = await trx<OrderRow>("orders").where({ id: payment.order_id }).forUpdate().first();
  const quote = await trx<QuoteRow>("quotes").where({ id: payment.quote_id, order_id: payment.order_id }).forUpdate().first();
  if (!order || !quote) return none;

  const actor = { actorId: `${payment.provider}-settlement`, actorType: "system" as const };
  const refund = async (reason: "order_duplicate" | "order_closed"): Promise<OrderPaymentOutcome> => {
    const refundId = await recordOrderRefund(trx, {
      orderId: order.id,
      paymentRequestId: payment.id,
      reason,
      actorId: null,
      actorType: "system",
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return { refundId, merchantNotice: null };
  };

  if (quote.paid_at) return refund("order_duplicate");

  const now = new Date();
  if (quote.kind === "original") {
    if (order.status !== "awaiting_payment") return refund("order_closed");
    await trx("quotes").where({ id: quote.id }).update({ paid_at: now, updated_at: now });
    const [moved] = await trx<OrderRow>("orders")
      .where({ id: order.id, status: "awaiting_payment" })
      .update({ status: "paid", paid_at: now, updated_at: now })
      .returning("*");
    if (!moved) return refund("order_closed");
    await writeAuditEntry(trx, {
      ...actor,
      action: "order.paid",
      entityType: "order",
      entityId: order.id,
      before: { status: "awaiting_payment" },
      after: { status: "paid", payment_request_id: payment.id, quote_id: quote.id, amount: payment.amount_amount },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    const id = await notify(trx, {
      merchantId: order.merchant_id,
      category: "booking",
      title: `${order.ref} · paid · you can start`,
      body: `The customer has paid ${kesText(order.gross_amount)} to CRAL for this job. CRAL holds it and pays you once they confirm the work is done.`,
      ref: order.ref,
      subjectType: "garage_order",
      subjectId: order.id,
    });
    return { refundId: null, merchantNotice: { merchantId: order.merchant_id, id } };
  }

  // An extra-work quote: only while the job is still being worked on, and
  // only once the customer has said yes to it.
  if (quote.status !== "accepted" || order.status !== "in_progress") return refund("order_closed");
  await trx("quotes").where({ id: quote.id }).update({ paid_at: now, updated_at: now });
  // The order's money is the sum of the paid quotes' snapshots.
  await trx<OrderRow>("orders")
    .where({ id: order.id })
    .update({
      gross_amount: order.gross_amount + quote.total_amount,
      commission_amount: order.commission_amount + (quote.commission_amount ?? 0),
      merchant_net_amount: order.merchant_net_amount + (quote.merchant_net_amount ?? 0),
      updated_at: now,
    });
  await writeAuditEntry(trx, {
    ...actor,
    action: "order.extra_paid",
    entityType: "order",
    entityId: order.id,
    before: { gross: order.gross_amount },
    after: { gross: order.gross_amount + quote.total_amount, quote_id: quote.id, payment_request_id: payment.id },
    requestId: ctx.requestId,
    ip: ctx.ip,
  });
  const id = await notify(trx, {
    merchantId: order.merchant_id,
    category: "booking",
    title: `${order.ref} · extra work paid`,
    body: `The customer has paid ${kesText(quote.total_amount)} for the extra work. Go ahead with it.`,
    ref: order.ref,
    subjectType: "garage_order",
    subjectId: order.id,
  });
  return { refundId: null, merchantNotice: { merchantId: order.merchant_id, id } };
}

/** The plated ref for a refund's narration. */
export async function orderRefFor(orderId: string): Promise<string> {
  const row = await db<OrderRow>("orders").where({ id: orderId }).first("ref");
  return row?.ref ?? orderId;
}

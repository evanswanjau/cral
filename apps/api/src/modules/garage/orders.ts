import { ApiError, kes } from "@cral/types";
import type { Knex } from "knex";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { notify } from "../../lib/notifications.js";
import { normalizePhone } from "../../lib/identifier.js";
import { executeRefund, recordOrderRefund } from "../../lib/refunds.js";
import { enqueueNotificationDelivery } from "../../jobs/notification-delivery.js";
import { commissionRateFor, takeHome } from "../../lib/commission.js";
import { getOrCreateMerchant, type RequestContext } from "../merchant/service.js";
import { startStkPush, type PaymentRequestRow } from "../payments/service.js";
import type { OutletRow } from "../outlets/service.js";
import { verticalOf, type CarRow, type QuoteRequestRow, type QuoteRow, type RequestKind } from "./service.js";
import { AUTO_CONFIRM_MS, QUOTE_VALID_MS, type ExtraQuoteInput } from "./schemas.js";

/**
 * Garage orders (Phase 4 GS3 - docs/decisions/garage.md; contracts
 * openapi/customer-garage.yaml, openapi/merchant-garage.yaml,
 * openapi/admin-garage-orders.yaml).
 *
 * Accepting a quote creates an order. The customer pays CRAL upfront by
 * M-Pesa through `startStkPush`; `applySettlement` moves the order to
 * `paid` (`order-settlement.ts`). The garage starts, may send a second
 * quote for extra work that the customer accepts and pays before it is
 * done, and marks the job ready. The customer confirms, or it confirms
 * itself 72 h after ready unless they raised a problem; a problem goes to
 * Ops, who release the money to the garage or refund the customer. A
 * completed order joins the merchant's payout runs through `cutPayoutRun`.
 *
 * Every transition is a conditional update on the status it checked (409
 * when it moved) with `audit_log` in the same transaction. Amounts are
 * integer cents, snapshotted on the quote when it is accepted.
 *
 * Spare parts (Phase 5 PT1, docs/decisions/parts.md) run on the same
 * order: `kind = 'part'`, ref `P-YYMMDD-NNN`, the parts commission. The
 * dealer marks the part delivered or fitted (`ready`) straight from
 * `paid`; the customer confirms it's the right part, or opens a wrong-part
 * dispute (`problem`) for Ops. No extra-work quotes on a part.
 */

export type OrderStatus =
  | "awaiting_payment"
  | "paid"
  | "in_progress"
  | "ready"
  | "completed"
  | "problem"
  | "cancelled"
  | "refunded";

export interface OrderRow {
  id: string;
  ref: string;
  kind: "service" | "part";
  request_id: string;
  quote_id: string;
  outlet_id: string;
  merchant_id: string;
  user_id: string;
  car_id: string;
  status: OrderStatus;
  gross_amount: number;
  gross_currency: string;
  commission_amount: number;
  commission_currency: string;
  merchant_net_amount: number;
  merchant_net_currency: string;
  paid_at: Date | null;
  started_at: Date | null;
  ready_at: Date | null;
  completed_at: Date | null;
  confirmed_by: "customer" | "auto" | "ops" | null;
  cancelled_at: Date | null;
  problem_raised_at: Date | null;
  problem_note: string | null;
  resolved_at: Date | null;
  resolution_note: string | null;
  resolved_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Words that differ between a garage job and a part order. */
const WORDS = {
  service: { business: "garage", thing: "job" },
  part: { business: "dealer", thing: "order" },
} as const;

/** How a part order's `ready` reads: the accepted quote says fitted or delivered. */
async function fulfilmentOf(order: OrderRow, trx: Knex | Knex.Transaction = db): Promise<"fitted" | "delivered" | null> {
  if (order.kind !== "part") return null;
  const q = await trx<QuoteRow>("quotes").where({ id: order.quote_id }).first("fulfilment");
  return q?.fulfilment ?? null;
}

interface LineRow {
  quote_id: string;
  position: number;
  kind: string;
  description: string;
  amount_amount: number;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function notFound(): never {
  throw new ApiError({ status: 404, type: "not_found", code: "order_not_found", message: "That job isn't on your account." });
}
function conflict(code: string, message: string): never {
  throw new ApiError({ status: 409, type: "conflict", code, message });
}
function invalid(code: string, message: string, field?: string): never {
  throw new ApiError({ status: 422, type: "validation_error", code, message, ...(field ? { field } : {}) });
}

type Actor = { id: string | null; type: "user" | "admin" | "system" };

async function audit(
  trx: Knex.Transaction,
  actor: Actor,
  action: string,
  orderId: string,
  ctx: RequestContext,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): Promise<void> {
  await writeAuditEntry(trx, {
    actorId: actor.id,
    actorType: actor.type,
    action,
    entityType: "order",
    entityId: orderId,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    requestId: ctx.requestId,
    ip: ctx.ip,
  });
}

const kesText = (cents: number) => `KES ${Math.round(cents / 100).toLocaleString("en-KE")}`;
const isExpired = (q: QuoteRow) => q.valid_until.getTime() < Date.now();

/**
 * The plated order ref, `G-YYMMDD-NNN`: the same "which day, which one that
 * day" shape as `CB-` bookings and `H-` listings (conventions.md), from its
 * own daily counter in the caller's transaction.
 */
async function nextOrderRef(trx: Knex.Transaction, kind: RequestKind): Promise<string> {
  const result = await trx.raw<{ rows: { day: string; n: number }[] }>(
    `INSERT INTO order_ref_daily_counters (day, n, created_at, updated_at)
     VALUES ((now() AT TIME ZONE 'Africa/Nairobi')::date, 1, now(), now())
     ON CONFLICT (day)
     DO UPDATE SET n = order_ref_daily_counters.n + 1, updated_at = now()
     RETURNING to_char(day, 'YYMMDD') AS day, n`,
  );
  const { day, n } = result.rows[0]!;
  // One daily counter for both kinds; the letter says which.
  return `${kind === "part" ? "P" : "G"}-${day}-${String(n).padStart(3, "0")}`;
}

/** The quote the customer owes money on right now, if any. */
function dueQuote(order: OrderRow, quotes: QuoteRow[]): QuoteRow | null {
  if (order.status === "awaiting_payment") return quotes.find((q) => q.id === order.quote_id) ?? null;
  if (order.status === "in_progress") {
    return quotes.find((q) => q.kind === "extra" && q.status === "accepted" && !q.paid_at) ?? null;
  }
  return null;
}

/** An extra quote still waiting on the customer: sent, or accepted and unpaid. */
function openExtra(quotes: QuoteRow[]): QuoteRow | null {
  return quotes.find((q) => q.kind === "extra" && (q.status === "sent" || (q.status === "accepted" && !q.paid_at))) ?? null;
}

async function inFlightPayment(trx: Knex | Knex.Transaction, orderId: string): Promise<PaymentRequestRow | undefined> {
  return trx<PaymentRequestRow>("payment_requests")
    .where({ order_id: orderId, status: "pending" })
    .where("expires_at", ">", new Date())
    .first();
}

async function quotesOf(orderId: string, trx: Knex | Knex.Transaction = db): Promise<QuoteRow[]> {
  return trx<QuoteRow>("quotes").where({ order_id: orderId }).orderBy("created_at", "asc");
}

async function linesFor(quoteIds: string[]): Promise<Map<string, LineRow[]>> {
  const out = new Map<string, LineRow[]>(quoteIds.map((id) => [id, []]));
  if (!quoteIds.length) return out;
  const rows = await db<LineRow>("quote_lines").whereIn("quote_id", quoteIds).orderBy("position", "asc");
  for (const r of rows) out.get(r.quote_id)?.push(r);
  return out;
}

type Audience = "customer" | "merchant" | "admin";

/**
 * One serializer, three audiences. The merchant never sees CRAL's
 * commission (amount or rate) or anything about the customer beyond a
 * first name; it sees what it keeps, in shillings.
 */
async function serializeOrder(order: OrderRow, audience: Audience) {
  const [quotes, car, outlet, request, user, payment] = await Promise.all([
    quotesOf(order.id),
    db<CarRow>("customer_cars").where({ id: order.car_id }).first(),
    db<OutletRow>("outlets").where({ id: order.outlet_id }).first(),
    db<QuoteRequestRow>("quote_requests").where({ id: order.request_id }).first(),
    db<{ id: string; full_name: string | null; phone: string | null }>("users").where({ id: order.user_id }).first("id", "full_name", "phone"),
    db<PaymentRequestRow>("payment_requests").where({ order_id: order.id }).orderBy("created_at", "desc").first(),
  ]);
  const lines = await linesFor(quotes.map((q) => q.id));
  const rate = audience === "merchant" ? await commissionRateFor(verticalOf(order.kind)) : 0;
  const original = quotes.find((q) => q.id === order.quote_id);
  const due = dueQuote(order, quotes);
  const autoConfirmAt = order.status === "ready" && order.ready_at ? new Date(order.ready_at.getTime() + AUTO_CONFIRM_MS) : null;

  const quoteOut = (q: QuoteRow) => ({
    id: q.id,
    kind: q.kind,
    status: q.status,
    lines: (lines.get(q.id) ?? []).map((l) => ({ kind: l.kind, description: l.description, amount: kes(l.amount_amount) })),
    total: kes(q.total_amount),
    ...(audience === "merchant"
      ? // The snapshot once accepted; before that, today's figure.
        { take_home: kes(q.merchant_net_amount ?? takeHome(q.total_amount, rate)) }
      : {}),
    ...(audience === "admin"
      ? { commission: q.commission_amount === null ? null : kes(q.commission_amount) }
      : {}),
    days_needed: q.days_needed,
    part_condition: q.part_condition,
    fulfilment: q.fulfilment,
    note: q.note,
    sent_at: q.sent_at.toISOString(),
    valid_until: q.valid_until.toISOString(),
    expired: q.status === "sent" && isExpired(q),
    accepted_at: q.accepted_at ? q.accepted_at.toISOString() : null,
    paid_at: q.paid_at ? q.paid_at.toISOString() : null,
  });

  const paymentOut = payment
    ? {
        status:
          payment.status === "pending" && payment.expires_at.getTime() <= Date.now() ? ("expired" as const) : payment.status,
        quote_id: payment.quote_id,
        amount: kes(payment.amount_amount),
        receipt: payment.provider_receipt,
        failure_reason: payment.failure_reason,
      }
    : null;

  return {
    id: order.id,
    ref: order.ref,
    status: order.status,
    kind: order.kind,
    request_id: order.request_id,
    service_type: request?.service_type ?? null,
    part_name: request?.part_name ?? null,
    // Parts: how the dealer hands it over, and where a delivery goes.
    fulfilment: original?.fulfilment ?? null,
    part_condition: original?.part_condition ?? null,
    delivery_address: request?.delivery_address ?? null,
    description: request?.description ?? null,
    car: car ? { make: car.make, model: car.model, year: car.year, plate: car.plate } : null,
    outlet: outlet ? { id: outlet.id, name: outlet.name, address: outlet.address, county: outlet.county } : null,
    ...(audience === "customer" ? {} : { customer_first_name: user?.full_name?.trim().split(/\s+/)[0] ?? null }),
    ...(audience === "admin" ? { customer_phone: user?.phone ?? null, merchant_id: order.merchant_id } : {}),
    quotes: quotes.map(quoteOut),
    // The paid work so far: the sum of the paid quotes' snapshots.
    total: kes(order.gross_amount),
    ...(audience === "merchant" ? { take_home: kes(order.merchant_net_amount) } : {}),
    ...(audience === "admin" ? { commission: kes(order.commission_amount), merchant_net: kes(order.merchant_net_amount) } : {}),
    amount_due: due ? kes(due.total_amount) : null,
    due_quote_id: due?.id ?? null,
    ...(audience === "merchant" ? {} : { payment: paymentOut }),
    paid_at: order.paid_at?.toISOString() ?? null,
    started_at: order.started_at?.toISOString() ?? null,
    ready_at: order.ready_at?.toISOString() ?? null,
    auto_confirm_at: autoConfirmAt?.toISOString() ?? null,
    completed_at: order.completed_at?.toISOString() ?? null,
    confirmed_by: order.confirmed_by,
    cancelled_at: order.cancelled_at?.toISOString() ?? null,
    problem_raised_at: order.problem_raised_at?.toISOString() ?? null,
    problem_note: order.problem_note,
    resolved_at: order.resolved_at?.toISOString() ?? null,
    resolution_note: order.resolution_note,
    created_at: order.created_at.toISOString(),
  };
}

async function requireMyOrder(userId: string, orderId: string): Promise<OrderRow> {
  const o = await db<OrderRow>("orders").where({ id: orderId, user_id: userId }).first();
  if (!o) notFound();
  return o;
}

async function requireMerchantOrder(userId: string, orderId: string): Promise<{ order: OrderRow; merchantId: string }> {
  const merchant = await getOrCreateMerchant(userId);
  const o = await db<OrderRow>("orders").where({ id: orderId, merchant_id: merchant.id }).first();
  if (!o) notFound();
  return { order: o, merchantId: merchant.id };
}

/**
 * A conditional status move: `where status in (from)` then update. Throws
 * 409 when the row moved under us. Returns the updated row.
 */
async function move(
  trx: Knex.Transaction,
  orderId: string,
  from: OrderStatus[],
  update: Partial<OrderRow>,
  code = "order_state_changed",
  message = "This job has moved on since you opened it. Refresh to see where it is.",
): Promise<OrderRow> {
  const [row] = await trx<OrderRow>("orders")
    .where({ id: orderId })
    .whereIn("status", from)
    .update({ ...update, updated_at: new Date() })
    .returning("*");
  if (!row) conflict(code, message);
  return row;
}

async function deliver(notices: Array<{ merchantId?: string; userId?: string; id: string }>): Promise<void> {
  for (const n of notices) if (n.merchantId) await enqueueNotificationDelivery(n.merchantId, [n.id]);
}

function noExtrasOnParts(): never {
  conflict("not_for_parts", "A part order has no extra-work quotes. Anything else is a new parts request.");
}

// ---------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------

/**
 * Accepting a quote: the request closes, the other garages' quotes are
 * superseded, the quote's money is snapshotted at today's garage rate and
 * an order waits for payment. One transaction, the request row locked
 * against a racing cancel or a second accept.
 */
export async function acceptQuote(userId: string, requestId: string, quoteId: string, ctx: RequestContext) {
  const request = await db<QuoteRequestRow>("quote_requests").where({ id: requestId, user_id: userId }).first();
  if (!request) throw new ApiError({ status: 404, type: "not_found", code: "request_not_found", message: "That request isn't on your account." });
  const rate = await commissionRateFor(verticalOf(request.kind));
  const w = WORDS[request.kind];
  const notices: Array<{ merchantId: string; id: string }> = [];

  const order = await db.transaction(async (trx) => {
    const locked = await trx<QuoteRequestRow>("quote_requests").where({ id: request.id }).forUpdate().first();
    if (!locked || locked.status !== "open") conflict("request_not_open", "This request is already closed.");
    const quote = await trx<QuoteRow>("quotes").where({ id: quoteId, request_id: request.id, kind: "original" }).forUpdate().first();
    if (!quote || quote.status !== "sent") conflict("quote_not_available", `That ${w.business}'s quote is no longer open.`);
    if (isExpired(quote)) conflict("quote_expired", `That quote has expired. Ask the ${w.business} to send it again.`);
    const car = await trx<CarRow>("customer_cars").where({ id: request.car_id }).first();

    const now = new Date();
    const net = takeHome(quote.total_amount, rate);
    const commission = quote.total_amount - net;
    const orderId = generateId("order");
    const ref = await nextOrderRef(trx, request.kind);
    const [row] = await trx<OrderRow>("orders")
      .insert({
        id: orderId,
        ref,
        kind: request.kind,
        request_id: request.id,
        quote_id: quote.id,
        outlet_id: quote.outlet_id,
        merchant_id: quote.merchant_id,
        user_id: userId,
        car_id: request.car_id,
        status: "awaiting_payment",
        gross_amount: quote.total_amount,
        gross_currency: "KES",
        commission_amount: commission,
        commission_currency: "KES",
        merchant_net_amount: net,
        merchant_net_currency: "KES",
      })
      .returning("*");
    if (!row) throw new Error("Failed to create order");

    const [accepted] = await trx<QuoteRow>("quotes")
      .where({ id: quote.id, status: "sent" })
      .update({
        status: "accepted",
        order_id: orderId,
        accepted_at: now,
        commission_amount: commission,
        merchant_net_amount: net,
        updated_at: now,
      })
      .returning("*");
    if (!accepted) conflict("quote_not_available", `That ${w.business}'s quote is no longer open.`);

    const others = await trx<QuoteRow>("quotes")
      .where({ request_id: request.id, kind: "original", status: "sent" })
      .whereNot({ id: quote.id })
      .update({ status: "superseded", updated_at: now })
      .returning("*");
    await trx("quote_requests").where({ id: request.id, status: "open" }).update({ status: "accepted", updated_at: now });

    await audit(trx, { id: userId, type: "user" }, "quote.accepted", orderId, ctx, undefined, {
      quote_id: quote.id,
      request_id: request.id,
      total: quote.total_amount,
      commission,
      merchant_net: net,
      superseded: others.map((o) => o.id),
    });

    const vehicle = request.kind === "part"
      ? `${request.part_name ?? "the part"} for ${car ? `a ${car.year} ${car.make} ${car.model}` : "the car"}`
      : car ? `${car.year} ${car.make} ${car.model}` : "the car";
    notices.push({
      merchantId: quote.merchant_id,
      id: await notify(trx, {
        merchantId: quote.merchant_id,
        category: "booking",
        title: `${ref} · your quote was accepted`,
        body: `The customer accepted your ${kesText(quote.total_amount)} quote for ${vehicle}. Wait for their payment to reach CRAL before you ${request.kind === "part" ? "send or fit the part" : "start"}.`,
        ref,
        subjectType: "garage_order",
        subjectId: orderId,
      }),
    });
    for (const o of others) {
      await notify(trx, {
        merchantId: o.merchant_id,
        category: "booking",
        title: `The customer chose another ${w.business}`,
        body: `Your quote for ${vehicle} was not picked this time.`,
        ref: vehicle,
        subjectType: "garage_request",
        subjectId: request.id,
      });
    }
    return row;
  });
  await deliver(notices);
  return serializeOrder(order, "customer");
}

export async function listMyOrders(userId: string, query: { kind?: RequestKind | undefined; cursor?: string | undefined; limit: number }) {
  const rows = await applyCursor(db<OrderRow>("orders").where({ user_id: userId, kind: query.kind ?? "service" }).select("*"), {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const paged = toPaginatedResult(rows as OrderRow[], query.limit, "created_at");
  return {
    data: await Promise.all(paged.data.map((o) => serializeOrder(o, "customer"))),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
  };
}

export async function getMyOrder(userId: string, orderId: string) {
  return serializeOrder(await requireMyOrder(userId, orderId), "customer");
}

/**
 * Pay what is due: the accepted quote while the order awaits payment, or
 * an accepted extra-work quote while the job is in progress. A quote paid
 * once is 409 `already_paid`; a prompt still open is returned as-is rather
 * than pushed twice. A late second success is refunded at settlement.
 */
export async function payOrder(userId: string, orderId: string, input: { phone: string }, ctx: RequestContext) {
  const order = await requireMyOrder(userId, orderId);
  const quotes = await quotesOf(order.id);
  const due = dueQuote(order, quotes);
  if (!due) {
    const paidAlready = order.status !== "awaiting_payment" && order.status !== "cancelled" && order.status !== "refunded";
    conflict(
      paidAlready ? "already_paid" : "order_not_payable",
      paidAlready ? "Nothing is owed on this job right now." : `A ${order.status.replace("_", " ")} job can't be paid.`,
    );
  }
  const prior = await db<PaymentRequestRow>("payment_requests")
    .where({ order_id: order.id, quote_id: due.id })
    .whereIn("status", ["pending", "success"])
    .orderBy("created_at", "desc")
    .first();
  if (prior?.status === "success") conflict("already_paid", "This is already paid.");
  if (prior?.status === "pending" && prior.expires_at.getTime() > Date.now()) {
    return { payment_request_id: prior.id, status: prior.status };
  }
  const phone = normalizePhone(input.phone);
  if (!phone) invalid("invalid_phone", "That doesn't look like a valid phone number.", "phone");
  return startStkPush({
    subject: { orderId: order.id, quoteId: due.id },
    purpose: "order",
    amountCents: due.total_amount,
    phone,
    ref: order.ref,
    userId,
    ctx,
  });
}

/** Cancel an order nobody has paid for. A prompt still open blocks it. */
export async function cancelMyOrder(userId: string, orderId: string, ctx: RequestContext) {
  const order = await requireMyOrder(userId, orderId);
  const row = await db.transaction(async (trx) => {
    if (await inFlightPayment(trx, order.id)) {
      conflict("payment_in_flight", "A payment prompt is still open on your phone. Wait for it to finish first.");
    }
    const next = await move(trx, order.id, ["awaiting_payment"], { status: "cancelled", cancelled_at: new Date() }, "order_not_cancellable", "Only a job that hasn't been paid for can be cancelled here.");
    await trx("quote_requests").where({ id: order.request_id }).update({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() });
    await audit(trx, { id: userId, type: "user" }, "order.cancelled", order.id, ctx, { status: "awaiting_payment" }, { status: "cancelled" });
    await notify(trx, {
      merchantId: order.merchant_id,
      category: "booking",
      title: `${order.ref} · cancelled before payment`,
      body: "The customer cancelled this job before paying. Nothing is owed either way.",
      ref: order.ref,
      subjectType: "garage_order",
      subjectId: order.id,
    });
    return next;
  });
  return serializeOrder(row, "customer");
}

/** Say yes to an extra-work quote. Its money is snapshotted now; paying it is `payOrder`. */
export async function acceptExtra(userId: string, orderId: string, quoteId: string, ctx: RequestContext) {
  const order = await requireMyOrder(userId, orderId);
  if (order.kind === "part") noExtrasOnParts();
  const rate = await commissionRateFor(verticalOf(order.kind));
  const notices: Array<{ merchantId: string; id: string }> = [];
  const row = await db.transaction(async (trx) => {
    const locked = await trx<OrderRow>("orders").where({ id: order.id }).forUpdate().first();
    if (!locked || locked.status !== "in_progress") conflict("order_state_changed", "Extra work can only be agreed while the job is in progress.");
    const quote = await trx<QuoteRow>("quotes").where({ id: quoteId, order_id: order.id, kind: "extra" }).forUpdate().first();
    if (!quote || quote.status !== "sent") conflict("quote_not_available", "That extra-work quote is no longer open.");
    if (isExpired(quote)) conflict("quote_expired", "That quote has expired. Ask the garage to send it again.");
    const net = takeHome(quote.total_amount, rate);
    const now = new Date();
    await trx("quotes")
      .where({ id: quote.id, status: "sent" })
      .update({ status: "accepted", accepted_at: now, commission_amount: quote.total_amount - net, merchant_net_amount: net, updated_at: now });
    await audit(trx, { id: userId, type: "user" }, "order.extra_accepted", order.id, ctx, undefined, {
      quote_id: quote.id,
      total: quote.total_amount,
      commission: quote.total_amount - net,
      merchant_net: net,
    });
    notices.push({
      merchantId: order.merchant_id,
      id: await notify(trx, {
        merchantId: order.merchant_id,
        category: "booking",
        title: `${order.ref} · extra work agreed`,
        body: `The customer said yes to ${kesText(quote.total_amount)} of extra work. Wait for their payment before you do it.`,
        ref: order.ref,
        subjectType: "garage_order",
        subjectId: order.id,
      }),
    });
    return locked;
  });
  await deliver(notices);
  return serializeOrder(row, "customer");
}

/** Say no to extra work (or change your mind before paying). The garage finishes the original scope. */
export async function declineExtra(userId: string, orderId: string, quoteId: string, ctx: RequestContext) {
  const order = await requireMyOrder(userId, orderId);
  await db.transaction(async (trx) => {
    await trx<OrderRow>("orders").where({ id: order.id }).forUpdate().first();
    const quote = await trx<QuoteRow>("quotes").where({ id: quoteId, order_id: order.id, kind: "extra" }).forUpdate().first();
    if (!quote || !(quote.status === "sent" || (quote.status === "accepted" && !quote.paid_at))) {
      conflict("quote_not_available", "That extra-work quote is no longer open.");
    }
    if (quote.status === "accepted" && (await inFlightPayment(trx, order.id))) {
      conflict("payment_in_flight", "A payment prompt is still open on your phone. Wait for it to finish first.");
    }
    await trx("quotes").where({ id: quote.id, status: quote.status }).update({ status: "declined", updated_at: new Date() });
    await audit(trx, { id: userId, type: "user" }, "order.extra_declined", order.id, ctx, { status: quote.status }, { quote_id: quote.id, status: "declined" });
    await notify(trx, {
      merchantId: order.merchant_id,
      category: "booking",
      title: `${order.ref} · extra work declined`,
      body: "The customer said no to the extra work. Finish the job as first quoted.",
      ref: order.ref,
      subjectType: "garage_order",
      subjectId: order.id,
    });
  });
  return getMyOrder(userId, orderId);
}

/**
 * The customer confirms the work is done (garage), or that it's the right
 * part (parts). The merchant's money becomes payable.
 */
export async function confirmOrder(userId: string, orderId: string, ctx: RequestContext) {
  const order = await requireMyOrder(userId, orderId);
  const isPart = order.kind === "part";
  const notices: Array<{ merchantId: string; id: string }> = [];
  const row = await db.transaction(async (trx) => {
    const next = await move(
      trx,
      order.id,
      ["ready"],
      { status: "completed", completed_at: new Date(), confirmed_by: "customer" },
      "order_not_ready",
      isPart ? "You can confirm once the dealer says the part is delivered or fitted." : "You can confirm once the garage says the car is ready.",
    );
    await audit(trx, { id: userId, type: "user" }, isPart ? "order.right_part_confirmed" : "order.confirmed", order.id, ctx, { status: "ready" }, { status: "completed", confirmed_by: "customer" });
    notices.push({
      merchantId: order.merchant_id,
      id: await notify(trx, {
        merchantId: order.merchant_id,
        category: "payout",
        title: `${order.ref} · confirmed · ${kesText(next.merchant_net_amount)} to you`,
        body: isPart ? "The customer confirmed it's the right part. It joins your next payout." : "The customer confirmed the job. It joins your next payout.",
        ref: order.ref,
        subjectType: "garage_order",
        subjectId: order.id,
      }),
    });
    return next;
  });
  await deliver(notices);
  return serializeOrder(row, "customer");
}

/**
 * Something's wrong: stops the auto-confirm and sends the job to Ops. On a
 * part order this is the wrong-part dispute: the money stays with CRAL
 * until Ops releases it to the dealer or refunds the customer.
 */
export async function raiseProblem(userId: string, orderId: string, input: { note: string }, ctx: RequestContext) {
  const order = await requireMyOrder(userId, orderId);
  const isPart = order.kind === "part";
  const notices: Array<{ merchantId: string; id: string }> = [];
  const row = await db.transaction(async (trx) => {
    const next = await move(
      trx,
      order.id,
      ["in_progress", "ready"],
      { status: "problem", problem_raised_at: new Date(), problem_note: input.note },
      "order_not_disputable",
      isPart
        ? "A wrong part can be reported once the dealer has delivered or fitted it, before you confirm it."
        : "A problem can be raised while the job is in progress or ready, before you confirm it.",
    );
    await audit(trx, { id: userId, type: "user" }, isPart ? "order.wrong_part_disputed" : "order.problem_raised", order.id, ctx, { status: order.status }, { status: "problem", note: input.note });
    notices.push({
      merchantId: order.merchant_id,
      id: await notify(trx, {
        merchantId: order.merchant_id,
        category: "booking",
        title: isPart ? `${order.ref} · the customer says it's the wrong part` : `${order.ref} · the customer raised a problem`,
        body: "CRAL is looking into it and will be in touch. The payment stays with CRAL until it's settled.",
        ref: order.ref,
        subjectType: "garage_order",
        subjectId: order.id,
      }),
    });
    return next;
  });
  await deliver(notices);
  return serializeOrder(row, "customer");
}

// ---------------------------------------------------------------------
// Merchant
// ---------------------------------------------------------------------

const MERCHANT_FILTERS: Record<string, OrderStatus[]> = {
  active: ["awaiting_payment", "paid", "in_progress", "ready", "problem"],
  done: ["completed", "cancelled", "refunded"],
};

export async function listMerchantOrders(
  userId: string,
  query: { filter: "active" | "done" | "all"; kind?: RequestKind | undefined; cursor?: string | undefined; limit: number },
) {
  const merchant = await getOrCreateMerchant(userId);
  const base = db<OrderRow>("orders").where({ merchant_id: merchant.id }).select("*");
  if (query.filter !== "all") base.whereIn("status", MERCHANT_FILTERS[query.filter]!);
  if (query.kind) base.where({ kind: query.kind });
  const rows = await applyCursor(base, {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const paged = toPaginatedResult(rows as OrderRow[], query.limit, "created_at");
  const toStart = Number(
    (
      await db("orders")
        .where({ merchant_id: merchant.id, status: "paid" })
        .modify((q) => {
          if (query.kind) q.where({ kind: query.kind });
        })
        .count<{ count: string }[]>("* as count")
    )[0]?.count ?? 0,
  );
  return {
    data: await Promise.all(paged.data.map((o) => serializeOrder(o, "merchant"))),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
    counts: { to_start: toStart },
  };
}

export async function getMerchantOrder(userId: string, orderId: string) {
  return serializeOrder((await requireMerchantOrder(userId, orderId)).order, "merchant");
}

async function customerNotice(trx: Knex.Transaction, order: OrderRow, title: string, body: string): Promise<void> {
  // The customer's own feed (no SMS for customers yet, as with quotes).
  await notify(trx, { userId: order.user_id, category: "booking", title, body, ref: order.ref, subjectType: "garage_order", subjectId: order.id });
}

/** Paid -> in progress. The garage starts only once CRAL holds the money. */
export async function startOrder(userId: string, orderId: string, ctx: RequestContext) {
  const { order } = await requireMerchantOrder(userId, orderId);
  const row = await db.transaction(async (trx) => {
    const next = await move(trx, order.id, ["paid"], { status: "in_progress", started_at: new Date() }, "order_not_paid", order.status === "awaiting_payment" ? "Wait for the customer's payment to reach CRAL before you start." : "This job has already moved on.");
    await audit(trx, { id: userId, type: "user" }, "order.started", order.id, ctx, { status: "paid" }, { status: "in_progress" });
    await customerNotice(
      trx,
      order,
      order.kind === "part" ? `${order.ref} · the dealer is getting your part ready` : `${order.ref} · work has started`,
      order.kind === "part" ? "The dealer is preparing your part." : "The garage has started on your car.",
    );
    return next;
  });
  return serializeOrder(row, "merchant");
}

/**
 * In progress -> ready. Starts the 72 h confirmation window. A parts dealer
 * marks the part delivered or fitted straight from `paid` (or after
 * "preparing"), since there's nothing to start on a part.
 */
export async function markReady(userId: string, orderId: string, ctx: RequestContext) {
  const { order } = await requireMerchantOrder(userId, orderId);
  const isPart = order.kind === "part";
  const row = await db.transaction(async (trx) => {
    await trx<OrderRow>("orders").where({ id: order.id }).forUpdate().first();
    if (openExtra(await quotesOf(order.id, trx))) {
      conflict("extra_pending", "An extra-work quote is still waiting on the customer. Withdraw it, or wait for their answer and payment.");
    }
    const from: OrderStatus[] = isPart ? ["paid", "in_progress"] : ["in_progress"];
    const next = await move(
      trx,
      order.id,
      from,
      { status: "ready", ready_at: new Date() },
      isPart ? "order_not_paid" : "order_not_in_progress",
      isPart ? "Only a paid part order can be marked delivered or fitted." : "Only a job in progress can be marked ready.",
    );
    const fulfilment = await fulfilmentOf(order, trx);
    await audit(trx, { id: userId, type: "user" }, isPart ? `order.${fulfilment ?? "delivered"}` : "order.ready", order.id, ctx, { status: order.status }, { status: "ready" });
    await customerNotice(
      trx,
      order,
      isPart ? `${order.ref} · your part was ${fulfilment ?? "delivered"}` : `${order.ref} · your car is ready`,
      isPart
        ? "Check it's the right part and confirm. If you say nothing, it confirms itself after 72 hours. Wrong part? Report it before then."
        : "Collect it and confirm the job is done. If you say nothing, it confirms itself after 72 hours. Something wrong? Raise a problem before then.",
    );
    return next;
  });
  return serializeOrder(row, "merchant");
}

/**
 * A second quote for extra work found mid-job. Nothing is added to the bill
 * without the customer's yes and their payment. One open at a time.
 */
export async function sendExtra(userId: string, orderId: string, input: ExtraQuoteInput, ctx: RequestContext) {
  const { order, merchantId } = await requireMerchantOrder(userId, orderId);
  if (order.kind === "part") noExtrasOnParts();
  const total = input.lines.reduce((s, l) => s + l.amount, 0);
  const now = new Date();
  await db.transaction(async (trx) => {
    const locked = await trx<OrderRow>("orders").where({ id: order.id }).forUpdate().first();
    if (!locked || locked.status !== "in_progress") conflict("order_not_in_progress", "Extra work can only be quoted while the job is in progress.");
    if (openExtra(await quotesOf(order.id, trx))) conflict("extra_pending", "An extra-work quote is already waiting on the customer.");
    const quoteId = generateId("quote");
    await trx("quotes").insert({
      id: quoteId,
      kind: "extra",
      order_id: order.id,
      request_id: order.request_id,
      outlet_id: order.outlet_id,
      merchant_id: merchantId,
      status: "sent",
      days_needed: input.days_needed,
      note: input.note?.trim() || null,
      total_amount: total,
      total_currency: "KES",
      sent_at: now,
      valid_until: new Date(now.getTime() + QUOTE_VALID_MS),
    });
    await trx("quote_lines").insert(
      input.lines.map((l, i) => ({
        id: generateId("quoteLine"),
        quote_id: quoteId,
        position: i,
        kind: l.kind,
        description: l.description,
        amount_amount: l.amount,
        amount_currency: "KES",
      })),
    );
    await audit(trx, { id: userId, type: "user" }, "order.extra_sent", order.id, ctx, undefined, { quote_id: quoteId, total, lines: input.lines.length });
    await customerNotice(
      trx,
      order,
      `${order.ref} · the garage found extra work`,
      `${kesText(total)} more, itemised. Nothing is added unless you say yes and pay it.`,
    );
  });
  return getMerchantOrder(userId, orderId);
}

export async function withdrawExtra(userId: string, orderId: string, quoteId: string, ctx: RequestContext) {
  const { order } = await requireMerchantOrder(userId, orderId);
  await db.transaction(async (trx) => {
    await trx<OrderRow>("orders").where({ id: order.id }).forUpdate().first();
    const quote = await trx<QuoteRow>("quotes").where({ id: quoteId, order_id: order.id, kind: "extra" }).forUpdate().first();
    if (!quote || !(quote.status === "sent" || (quote.status === "accepted" && !quote.paid_at))) {
      conflict("quote_not_available", "That extra-work quote is no longer open.");
    }
    if (quote.status === "accepted" && (await inFlightPayment(trx, order.id))) {
      conflict("payment_in_flight", "The customer is paying this right now.");
    }
    await trx("quotes").where({ id: quote.id, status: quote.status }).update({ status: "withdrawn", updated_at: new Date() });
    await audit(trx, { id: userId, type: "user" }, "order.extra_withdrawn", order.id, ctx, { status: quote.status }, { quote_id: quote.id, status: "withdrawn" });
    await customerNotice(trx, order, `${order.ref} · extra-work quote withdrawn`, "The garage withdrew its extra-work quote.");
  });
  return getMerchantOrder(userId, orderId);
}

// ---------------------------------------------------------------------
// Auto-confirm sweep
// ---------------------------------------------------------------------

/**
 * Orders ready for 72 h with no problem raised confirm themselves (owner
 * decision 7, 2026-11-19). Each order is its own conditional update, so a
 * customer confirming or raising a problem at the same moment wins or
 * loses cleanly. Run by `jobs/garage-order-confirm.ts`.
 */
export async function autoConfirmReadyOrders(now: Date = new Date(), onlyOrderIds?: string[]): Promise<number> {
  const cutoff = new Date(now.getTime() - AUTO_CONFIRM_MS);
  const due = await db<OrderRow>("orders")
    .where({ status: "ready" })
    .where("ready_at", "<=", cutoff)
    .modify((q) => {
      if (onlyOrderIds) q.whereIn("id", onlyOrderIds);
    })
    .select("*");
  let confirmed = 0;
  for (const order of due) {
    const notices: Array<{ merchantId: string; id: string }> = [];
    const done = await db.transaction(async (trx) => {
      const [next] = await trx<OrderRow>("orders")
        .where({ id: order.id, status: "ready" })
        .where("ready_at", "<=", cutoff)
        .update({ status: "completed", completed_at: now, confirmed_by: "auto", updated_at: now })
        .returning("*");
      if (!next) return false;
      await audit(trx, { id: "garage-auto-confirm", type: "system" }, "order.auto_confirmed", order.id, { ip: null, requestId: null }, { status: "ready" }, { status: "completed", confirmed_by: "auto" });
      notices.push({
        merchantId: order.merchant_id,
        id: await notify(trx, {
          merchantId: order.merchant_id,
          category: "payout",
          title: `${order.ref} · confirmed · ${kesText(next.merchant_net_amount)} to you`,
          body: `72 hours passed with no problem raised, so the ${WORDS[(order as OrderRow).kind].thing} confirmed itself. It joins your next payout.`,
          ref: order.ref,
          subjectType: "garage_order",
          subjectId: order.id,
        }),
      });
      await customerNotice(
        trx,
        order,
        `${order.ref} · confirmed`,
        order.kind === "part"
          ? "72 hours passed since your part was handed over, so the order is confirmed and the dealer will be paid."
          : "72 hours passed since your car was ready, so the job is confirmed and the garage will be paid.",
      );
      return true;
    });
    if (done) {
      confirmed += 1;
      await deliver(notices);
    }
  }
  return confirmed;
}

// ---------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------

export async function listAdminOrders(query: {
  status?: OrderStatus | undefined;
  kind?: RequestKind | undefined;
  cursor?: string | undefined;
  limit: number;
}) {
  const base = db<OrderRow>("orders").select("*");
  if (query.status) base.where({ status: query.status });
  if (query.kind) base.where({ kind: query.kind });
  const rows = await applyCursor(base, {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const paged = toPaginatedResult(rows as OrderRow[], query.limit, "created_at");
  return {
    data: await Promise.all(paged.data.map((o) => serializeOrder(o, "admin"))),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
  };
}

export async function getAdminOrder(orderId: string) {
  const o = await db<OrderRow>("orders").where({ id: orderId }).first();
  if (!o) notFound();
  return serializeOrder(o, "admin");
}

/**
 * Ops settles a problem: `release` completes the order (the garage is
 * paid in its next run); `refund` sends every payment on the order back by
 * Send to M-Pesa through `executeRefund`, after commit.
 */
export async function resolveProblem(
  adminId: string,
  orderId: string,
  input: { outcome: "release" | "refund"; note: string },
  ctx: RequestContext,
) {
  const order = await db<OrderRow>("orders").where({ id: orderId }).first();
  if (!order) notFound();
  const refundIds: string[] = [];
  const notices: Array<{ merchantId: string; id: string }> = [];
  const now = new Date();
  await db.transaction(async (trx) => {
    const update: Partial<OrderRow> =
      input.outcome === "release"
        ? { status: "completed", completed_at: now, confirmed_by: "ops", resolved_at: now, resolution_note: input.note, resolved_by: adminId }
        : { status: "refunded", resolved_at: now, resolution_note: input.note, resolved_by: adminId };
    const next = await move(trx, order.id, ["problem"], update, "order_not_in_problem", "Only a job with a problem raised can be settled here.");
    if (input.outcome === "refund") {
      const payments = await trx<PaymentRequestRow>("payment_requests").where({ order_id: order.id, status: "success" });
      for (const p of payments) {
        const id = await recordOrderRefund(trx, {
          orderId: order.id,
          paymentRequestId: p.id,
          reason: "order_refunded",
          actorId: adminId,
          actorType: "admin",
          requestId: ctx.requestId,
          ip: ctx.ip,
        });
        if (id) refundIds.push(id);
      }
    }
    await audit(trx, { id: adminId, type: "admin" }, `order.problem_${input.outcome === "release" ? "released" : "refunded"}`, order.id, ctx, { status: "problem" }, { status: next.status, note: input.note, refund_ids: refundIds });
    notices.push({
      merchantId: order.merchant_id,
      id: await notify(trx, {
        merchantId: order.merchant_id,
        category: input.outcome === "release" ? "payout" : "booking",
        title:
          input.outcome === "release"
            ? `${order.ref} · settled · ${kesText(next.merchant_net_amount)} to you`
            : `${order.ref} · settled · the customer was refunded`,
        body: input.note,
        ref: order.ref,
        subjectType: "garage_order",
        subjectId: order.id,
      }),
    });
    await customerNotice(
      trx,
      order,
      input.outcome === "release" ? `${order.ref} · CRAL settled your problem` : `${order.ref} · your money is on its way back`,
      input.note,
    );
  });
  await deliver(notices);
  for (const id of refundIds) await executeRefund(id, order.ref);
  return getAdminOrder(order.id);
}

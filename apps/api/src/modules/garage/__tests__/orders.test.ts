import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createTestAdmin, createVerifiedTestUser } from "../../../test/helpers.js";
import { handleCallback } from "../../payments/service.js";
import { cutPayoutRun, payoutPosition } from "../../payouts/service.js";
import { autoConfirmReadyOrders } from "../orders.js";

/**
 * Garage orders (Phase 4 GS3). Accept -> pay (STK through the shared
 * `applySettlement`) -> start -> extra-work quote accepted and paid ->
 * ready -> confirmed (by the customer, the 72 h sweep or Ops) -> one
 * payout line through `cutPayoutRun`. Every transition is conditional
 * (409 when it moved); a quote can't be paid twice; a merchant never sees
 * CRAL's commission.
 */

const app = createApp();
const userIds: string[] = [];
const merchantIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  const orderIds = (await db("orders").whereIn("user_id", userIds).pluck("id")) as string[];
  if (orderIds.length) {
    const runIds = (await db("payout_run_lines").whereIn("order_id", orderIds).pluck("payout_run_id")) as string[];
    await db("payout_run_lines").whereIn("order_id", orderIds).delete();
    if (runIds.length) {
      await db("notifications").whereIn("subject_id", runIds).delete();
      await db("payout_runs").whereIn("id", runIds).delete();
    }
    const refundIds = (await db("refunds").whereIn("order_id", orderIds).pluck("id")) as string[];
    if (refundIds.length) {
      await db("disbursements").whereIn("refund_id", refundIds).delete();
      await db("refunds").whereIn("id", refundIds).delete();
    }
    await db("payment_requests").whereIn("order_id", orderIds).delete();
    await db("quotes").whereIn("order_id", orderIds).where({ kind: "extra" }).delete();
    await db("quotes").whereIn("order_id", orderIds).update({ order_id: null });
    await db("orders").whereIn("id", orderIds).delete();
  }
  if (userIds.length) {
    await db("quote_requests").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  if (adminIds.length) {
    await db("admin_sessions").whereIn("admin_user_id", adminIds).delete();
    await db("admin_users").whereIn("id", adminIds).delete();
  }
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": ulid() });

const TEST_ADDRESS = "Workshop Road (garage orders test)";
const SPARE = ["Kwale", "Kilifi", "Bomet", "Siaya", "Embu", "Vihiga", "Kitui", "Makueni", "Nyandarua", "Laikipia", "West Pokot", "Baringo"];
let COUNTY = SPARE[0]!;
let next = 0;
beforeEach(async () => {
  COUNTY = SPARE[next++ % SPARE.length]!;
  await db("outlets").where({ county: COUNTY, address: TEST_ADDRESS }).update({ status: "paused" });
});

async function user() {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  return u;
}

async function garage() {
  const owner = await user();
  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: owner.userId,
    owner_type: "individual",
    first_name: "Garage",
    surname: `Owner ${ulid().slice(-4)}`,
    payout_method: "mpesa",
    payout_same: true,
    onboarding_step: 5,
    onboarding_max_step: 5,
    onboarding_screen: "done",
    onboarding_submitted: true,
    garage_only: true,
    approved_at: new Date(),
  });
  merchantIds.push(merchantId);
  const outletId = generateId("outlet");
  await db("outlets").insert({
    id: outletId,
    merchant_id: merchantId,
    kind: "garage",
    name: `Garage ${ulid().slice(-5)}`,
    address: TEST_ADDRESS,
    county: COUNTY,
    opening_hours: "Mon to Sat, 8am to 6pm",
    service_types: ["service"],
    status: "live",
    decided_at: new Date(),
  });
  return { token: owner.accessToken, merchantId, outletId };
}

const LINES = [
  { kind: "part", description: "Brake pads", amount: 450000 },
  { kind: "labour", description: "Fitting", amount: 150000 },
];

/** A customer's request with two garages quoting; returns the cheaper garage's quote. */
async function quoted() {
  const g1 = await garage();
  const g2 = await garage();
  const c = await user();
  const car = await request(app).post("/me/cars").set(bearer(c.accessToken)).send({ make: "Mazda", model: "Demio", year: 2015, plate: `KD${ulid().slice(-5)}` });
  expect(car.status).toBe(201);
  const req = await request(app)
    .post("/me/garage-requests")
    .set(bearer(c.accessToken))
    .send({ car_id: car.body.id, service_type: "service", description: "Brakes squeal and the pedal feels soft.", county: COUNTY });
  expect(req.status).toBe(201);
  const requestId = req.body.id as string;
  expect((await request(app).post(`/merchant/garage-requests/${requestId}/quote`).set(bearer(g1.token)).send({ lines: LINES, days_needed: 1 })).status).toBe(200);
  expect(
    (await request(app).post(`/merchant/garage-requests/${requestId}/quote`).set(bearer(g2.token)).send({ lines: [{ kind: "labour", description: "All of it", amount: 900000 }], days_needed: 2 })).status,
  ).toBe(200);
  const quotes = (await request(app).get(`/me/garage-requests/${requestId}`).set(bearer(c.accessToken))).body.quotes as Array<{ id: string; outlet: { id: string } }>;
  const quoteId = quotes.find((q) => q.outlet.id === g1.outletId)!.id;
  const otherId = quotes.find((q) => q.outlet.id === g2.outletId)!.id;
  return { g1, g2, c, requestId, quoteId, otherId };
}

async function settle(orderId: string, opts: { succeeded?: boolean; amountShillings?: number | null; which?: "latest" } = {}) {
  const pr = await db("payment_requests").where({ order_id: orderId }).orderBy("created_at", "desc").first();
  await handleCallback(
    { reference: pr.provider_request_id, succeeded: opts.succeeded ?? true, receipt: `R${ulid().slice(-8)}`, amountShillings: opts.amountShillings ?? Math.round(pr.amount_amount / 100) },
    { ip: null, requestId: null },
  );
  return pr;
}

async function paidOrder() {
  const q = await quoted();
  const acc = await request(app).post(`/me/garage-requests/${q.requestId}/quotes/${q.quoteId}/accept`).set(bearer(q.c.accessToken)).set(idem());
  expect(acc.status).toBe(201);
  const orderId = acc.body.id as string;
  expect((await request(app).post(`/me/garage-orders/${orderId}/pay`).set(bearer(q.c.accessToken)).set(idem()).send({ phone: "0712345678" })).status).toBe(202);
  await settle(orderId);
  return { ...q, orderId };
}

describe("accepting a quote", () => {
  it("creates an order awaiting payment, supersedes the other quote and snapshots the money", async () => {
    const q = await quoted();
    const noKey = await request(app).post(`/me/garage-requests/${q.requestId}/quotes/${q.quoteId}/accept`).set(bearer(q.c.accessToken));
    expect(noKey.status).toBe(400);

    const acc = await request(app).post(`/me/garage-requests/${q.requestId}/quotes/${q.quoteId}/accept`).set(bearer(q.c.accessToken)).set(idem());
    expect(acc.status).toBe(201);
    expect(acc.body.status).toBe("awaiting_payment");
    expect(acc.body.ref).toMatch(/^G-\d{6}-\d{3}$/);
    expect(acc.body.amount_due).toEqual({ amount: 600000, currency: "KES" });

    const order = await db("orders").where({ id: acc.body.id }).first();
    expect(order.gross_amount).toBe(600000);
    expect(order.commission_amount + order.merchant_net_amount).toBe(600000);
    const quote = await db("quotes").where({ id: q.quoteId }).first();
    expect(quote.status).toBe("accepted");
    expect(quote.commission_amount).toBe(order.commission_amount);
    expect((await db("quotes").where({ id: q.otherId }).first()).status).toBe("superseded");
    expect((await db("quote_requests").where({ id: q.requestId }).first()).status).toBe("accepted");
    expect(await db("audit_log").where({ entity_type: "order", entity_id: acc.body.id, action: "quote.accepted" }).first()).toBeTruthy();

    // Second accept (another quote, or the same) on a closed request is 409.
    const again = await request(app).post(`/me/garage-requests/${q.requestId}/quotes/${q.otherId}/accept`).set(bearer(q.c.accessToken)).set(idem());
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("request_not_open");
  });

  it("refuses an expired quote", async () => {
    const q = await quoted();
    await db("quotes").where({ id: q.quoteId }).update({ valid_until: new Date(Date.now() - 1000) });
    const acc = await request(app).post(`/me/garage-requests/${q.requestId}/quotes/${q.quoteId}/accept`).set(bearer(q.c.accessToken)).set(idem());
    expect(acc.status).toBe(409);
    expect(acc.body.error.code).toBe("quote_expired");
  });
});

describe("paying", () => {
  it("settles through applySettlement, moves the order to paid, and won't take money twice", async () => {
    const q = await quoted();
    const acc = await request(app).post(`/me/garage-requests/${q.requestId}/quotes/${q.quoteId}/accept`).set(bearer(q.c.accessToken)).set(idem());
    const orderId = acc.body.id as string;

    // The garage can't start before the money is in.
    const early = await request(app).post(`/merchant/garage-orders/${orderId}/start`).set(bearer(q.g1.token));
    expect(early.status).toBe(409);

    const p1 = await request(app).post(`/me/garage-orders/${orderId}/pay`).set(bearer(q.c.accessToken)).set(idem()).send({ phone: "0712345678" });
    expect(p1.status).toBe(202);
    // An open prompt is returned, not pushed twice.
    const p2 = await request(app).post(`/me/garage-orders/${orderId}/pay`).set(bearer(q.c.accessToken)).set(idem()).send({ phone: "0712345678" });
    expect(p2.body.payment_request_id).toBe(p1.body.payment_request_id);
    const row = await db("payment_requests").where({ id: p1.body.payment_request_id }).first();
    expect(row.amount_amount).toBe(600000);
    expect(row.quote_id).toBe(q.quoteId);
    expect(row.booking_id).toBeNull();

    await settle(orderId);
    const order = await db("orders").where({ id: orderId }).first();
    expect(order.status).toBe("paid");
    expect(await db("audit_log").where({ entity_id: orderId, action: "order.paid" }).first()).toBeTruthy();

    const p3 = await request(app).post(`/me/garage-orders/${orderId}/pay`).set(bearer(q.c.accessToken)).set(idem()).send({ phone: "0712345678" });
    expect(p3.status).toBe(409);
    expect(p3.body.error.code).toBe("already_paid");
  });

  it("does not settle a payment for the wrong amount", async () => {
    const q = await quoted();
    const acc = await request(app).post(`/me/garage-requests/${q.requestId}/quotes/${q.quoteId}/accept`).set(bearer(q.c.accessToken)).set(idem());
    await request(app).post(`/me/garage-orders/${acc.body.id}/pay`).set(bearer(q.c.accessToken)).set(idem()).send({ phone: "0712345678" });
    const pr = await settle(acc.body.id, { amountShillings: 10 });
    expect((await db("payment_requests").where({ id: pr.id }).first()).status).toBe("failed");
    expect((await db("orders").where({ id: acc.body.id }).first()).status).toBe("awaiting_payment");
  });

  it("refunds a late second success for a quote already paid", async () => {
    const q = await quoted();
    const acc = await request(app).post(`/me/garage-requests/${q.requestId}/quotes/${q.quoteId}/accept`).set(bearer(q.c.accessToken)).set(idem());
    const orderId = acc.body.id as string;
    await request(app).post(`/me/garage-orders/${orderId}/pay`).set(bearer(q.c.accessToken)).set(idem()).send({ phone: "0712345678" });
    const first = await db("payment_requests").where({ order_id: orderId }).first();
    // The first prompt "expires" unanswered, the customer retries...
    await db("payment_requests").where({ id: first.id }).update({ expires_at: new Date(Date.now() - 1000) });
    await request(app).post(`/me/garage-orders/${orderId}/pay`).set(bearer(q.c.accessToken)).set(idem()).send({ phone: "0712345678" });
    const second = await db("payment_requests").where({ order_id: orderId }).whereNot({ id: first.id }).first();
    // ...and both are answered.
    for (const p of [second, first]) {
      await handleCallback({ reference: p.provider_request_id, succeeded: true, receipt: `R${ulid().slice(-8)}`, amountShillings: 6000 }, { ip: null, requestId: null });
    }
    const order = await db("orders").where({ id: orderId }).first();
    expect(order.status).toBe("paid");
    expect(order.gross_amount).toBe(600000);
    const refunds = await db("refunds").where({ order_id: orderId });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].payment_request_id).toBe(first.id);
    expect(refunds[0].reason).toBe("order_duplicate");
  });

  it("cancels an unpaid order, and refunds money that lands after", async () => {
    const q = await quoted();
    const acc = await request(app).post(`/me/garage-requests/${q.requestId}/quotes/${q.quoteId}/accept`).set(bearer(q.c.accessToken)).set(idem());
    const orderId = acc.body.id as string;
    await request(app).post(`/me/garage-orders/${orderId}/pay`).set(bearer(q.c.accessToken)).set(idem()).send({ phone: "0712345678" });
    const blocked = await request(app).post(`/me/garage-orders/${orderId}/cancel`).set(bearer(q.c.accessToken)).set(idem());
    expect(blocked.body.error.code).toBe("payment_in_flight");

    await db("payment_requests").where({ order_id: orderId }).update({ expires_at: new Date(Date.now() - 1000) });
    const cancelled = await request(app).post(`/me/garage-orders/${orderId}/cancel`).set(bearer(q.c.accessToken)).set(idem());
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");

    await settle(orderId);
    expect((await db("orders").where({ id: orderId }).first()).status).toBe("cancelled");
    const refund = await db("refunds").where({ order_id: orderId }).first();
    expect(refund.reason).toBe("order_closed");
  });
});

describe("the job", () => {
  it("runs start -> extra quote accepted and paid -> ready -> confirmed -> one payout line", async () => {
    const o = await paidOrder();
    const started = await request(app).post(`/merchant/garage-orders/${o.orderId}/start`).set(bearer(o.g1.token));
    expect(started.status).toBe(200);
    expect(started.body.status).toBe("in_progress");
    // The merchant never sees the commission.
    expect(JSON.stringify(started.body)).not.toMatch(/commission/);
    expect(started.body.take_home.amount).toBeLessThan(600000);

    const extra = await request(app)
      .post(`/merchant/garage-orders/${o.orderId}/extras`)
      .set(bearer(o.g1.token))
      .send({ lines: [{ kind: "part", description: "Brake disc", amount: 300000 }], days_needed: 1, note: "The disc is scored." });
    expect(extra.status).toBe(201);
    const extraId = extra.body.quotes.find((q: { kind: string }) => q.kind === "extra").id as string;

    // Another extra while one is open, and "ready" while one is open, are 409.
    const twice = await request(app).post(`/merchant/garage-orders/${o.orderId}/extras`).set(bearer(o.g1.token)).send({ lines: LINES, days_needed: 1 });
    expect(twice.body.error.code).toBe("extra_pending");
    expect((await request(app).post(`/merchant/garage-orders/${o.orderId}/ready`).set(bearer(o.g1.token))).body.error.code).toBe("extra_pending");

    // The extra doesn't show on the request's quote list.
    const reqView = await request(app).get(`/me/garage-requests/${o.requestId}`).set(bearer(o.c.accessToken));
    expect(reqView.body.quotes.find((q: { id: string }) => q.id === extraId)).toBeUndefined();
    expect(reqView.body.order.id).toBe(o.orderId);

    const yes = await request(app).post(`/me/garage-orders/${o.orderId}/extras/${extraId}/accept`).set(bearer(o.c.accessToken)).set(idem());
    expect(yes.status).toBe(200);
    expect(yes.body.amount_due).toEqual({ amount: 300000, currency: "KES" });
    expect(yes.body.due_quote_id).toBe(extraId);
    // Accepted but unpaid still blocks "ready".
    expect((await request(app).post(`/merchant/garage-orders/${o.orderId}/ready`).set(bearer(o.g1.token))).body.error.code).toBe("extra_pending");

    await request(app).post(`/me/garage-orders/${o.orderId}/pay`).set(bearer(o.c.accessToken)).set(idem()).send({ phone: "0712345678" });
    const extraPayment = await settle(o.orderId);
    expect(extraPayment.quote_id).toBe(extraId);
    let order = await db("orders").where({ id: o.orderId }).first();
    expect(order.gross_amount).toBe(900000);
    expect(order.commission_amount + order.merchant_net_amount).toBe(900000);

    const ready = await request(app).post(`/merchant/garage-orders/${o.orderId}/ready`).set(bearer(o.g1.token));
    expect(ready.body.status).toBe("ready");
    const custView = await request(app).get(`/me/garage-orders/${o.orderId}`).set(bearer(o.c.accessToken));
    expect(custView.body.auto_confirm_at).toBeTruthy();

    // Not payable yet: clearing, not next payout.
    let position = await payoutPosition(o.g1.merchantId);
    expect(position.clearingOrders.map((x) => x.id)).toContain(o.orderId);
    expect(position.payableOrders).toHaveLength(0);

    const confirm = await request(app).post(`/me/garage-orders/${o.orderId}/confirm`).set(bearer(o.c.accessToken)).set(idem());
    expect(confirm.body.status).toBe("completed");
    expect(confirm.body.confirmed_by).toBe("customer");
    const again = await request(app).post(`/me/garage-orders/${o.orderId}/confirm`).set(bearer(o.c.accessToken)).set(idem());
    expect(again.status).toBe(409);

    order = await db("orders").where({ id: o.orderId }).first();
    position = await payoutPosition(o.g1.merchantId);
    expect(position.payableOrders.map((x) => x.id)).toEqual([o.orderId]);
    expect(position.nextPayoutAmount).toBe(order.merchant_net_amount);

    const dest = { method: "mpesa", detail: "0712345678", accountName: "Garage Owner" };
    const run = await db.transaction((trx) => cutPayoutRun(trx, o.g1.merchantId, dest));
    expect(run).not.toBeNull();
    expect(run!.net_amount).toBe(order.merchant_net_amount);
    const lines = await db("payout_run_lines").where({ payout_run_id: run!.id });
    expect(lines).toHaveLength(1);
    expect(lines[0].order_id).toBe(o.orderId);
    expect(lines[0].booking_id).toBeNull();
    expect(lines[0].booking_ref).toBe(order.ref);
    expect(lines[0].gross_amount).toBe(900000);
    // Paid out exactly once.
    expect(await db.transaction((trx) => cutPayoutRun(trx, o.g1.merchantId, dest))).toBeNull();
    await expect(
      db("payout_run_lines").insert({ ...lines[0], id: generateId("payoutRunLine") }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("a declined extra leaves the bill alone and the garage finishes the original scope", async () => {
    const o = await paidOrder();
    await request(app).post(`/merchant/garage-orders/${o.orderId}/start`).set(bearer(o.g1.token));
    const extra = await request(app).post(`/merchant/garage-orders/${o.orderId}/extras`).set(bearer(o.g1.token)).send({ lines: [{ kind: "other", description: "Wheel alignment", amount: 200000 }], days_needed: 1 });
    const extraId = extra.body.quotes.find((q: { kind: string }) => q.kind === "extra").id as string;
    const no = await request(app).post(`/me/garage-orders/${o.orderId}/extras/${extraId}/decline`).set(bearer(o.c.accessToken));
    expect(no.status).toBe(200);
    // Nothing to pay.
    const pay = await request(app).post(`/me/garage-orders/${o.orderId}/pay`).set(bearer(o.c.accessToken)).set(idem()).send({ phone: "0712345678" });
    expect(pay.body.error.code).toBe("already_paid");
    expect((await request(app).post(`/merchant/garage-orders/${o.orderId}/ready`).set(bearer(o.g1.token))).status).toBe(200);
    expect((await db("orders").where({ id: o.orderId }).first()).gross_amount).toBe(600000);
  });

  it("only the order's own merchant and customer can see it", async () => {
    const o = await paidOrder();
    expect((await request(app).get(`/merchant/garage-orders/${o.orderId}`).set(bearer(o.g2.token))).status).toBe(404);
    const stranger = await user();
    expect((await request(app).get(`/me/garage-orders/${o.orderId}`).set(bearer(stranger.accessToken))).status).toBe(404);
  });
});

describe("confirmation and problems", () => {
  it("auto-confirms 72 h after ready, and not before", async () => {
    const o = await paidOrder();
    await request(app).post(`/merchant/garage-orders/${o.orderId}/start`).set(bearer(o.g1.token));
    await request(app).post(`/merchant/garage-orders/${o.orderId}/ready`).set(bearer(o.g1.token));
    expect(await autoConfirmReadyOrders(new Date(), [o.orderId])).toBe(0);
    await db("orders").where({ id: o.orderId }).update({ ready_at: new Date(Date.now() - 73 * 3600_000) });
    expect(await autoConfirmReadyOrders(new Date(), [o.orderId])).toBe(1);
    const order = await db("orders").where({ id: o.orderId }).first();
    expect(order.status).toBe("completed");
    expect(order.confirmed_by).toBe("auto");
    expect(await db("audit_log").where({ entity_id: o.orderId, action: "order.auto_confirmed" }).first()).toBeTruthy();
    // A second sweep does nothing.
    expect(await autoConfirmReadyOrders(new Date(), [o.orderId])).toBe(0);
  });

  it("a problem stops the auto-confirm; Ops refunds every payment or releases it", async () => {
    const o = await paidOrder();
    await request(app).post(`/merchant/garage-orders/${o.orderId}/start`).set(bearer(o.g1.token));
    await request(app).post(`/merchant/garage-orders/${o.orderId}/ready`).set(bearer(o.g1.token));
    const problem = await request(app).post(`/me/garage-orders/${o.orderId}/problem`).set(bearer(o.c.accessToken)).send({ note: "The brakes still squeal on the first stop." });
    expect(problem.body.status).toBe("problem");
    await db("orders").where({ id: o.orderId }).update({ ready_at: new Date(Date.now() - 80 * 3600_000) });
    expect(await autoConfirmReadyOrders(new Date(), [o.orderId])).toBe(0);
    expect((await request(app).post(`/me/garage-orders/${o.orderId}/confirm`).set(bearer(o.c.accessToken)).set(idem())).status).toBe(409);

    const reviewer = await createTestAdmin("admin_reviewer");
    const support = await createTestAdmin("admin_support");
    adminIds.push(reviewer.adminId, support.adminId);
    expect((await request(app).get(`/admin/garage-orders?status=problem`).set(bearer(reviewer.token))).status).toBe(403);
    const list = await request(app).get(`/admin/garage-orders?status=problem`).set(bearer(support.token));
    expect(list.status).toBe(200);
    expect(list.body.data.map((x: { id: string }) => x.id)).toContain(o.orderId);

    const res = await request(app).post(`/admin/garage-orders/${o.orderId}/resolve`).set(bearer(support.token)).set(idem()).send({ outcome: "refund", note: "The garage could not fix it; refunded in full." });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("refunded");
    const refunds = await db("refunds").where({ order_id: o.orderId, reason: "order_refunded" });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount_amount).toBe(600000);
    // Nothing to pay the garage.
    expect((await payoutPosition(o.g1.merchantId)).payableOrders).toHaveLength(0);
    const again = await request(app).post(`/admin/garage-orders/${o.orderId}/resolve`).set(bearer(support.token)).set(idem()).send({ outcome: "release", note: "Second go." });
    expect(again.status).toBe(409);

    // Release on another order makes it payable.
    const o2 = await paidOrder();
    await request(app).post(`/merchant/garage-orders/${o2.orderId}/start`).set(bearer(o2.g1.token));
    await request(app).post(`/me/garage-orders/${o2.orderId}/problem`).set(bearer(o2.c.accessToken)).send({ note: "They are taking much longer than quoted." });
    const rel = await request(app).post(`/admin/garage-orders/${o2.orderId}/resolve`).set(bearer(support.token)).set(idem()).send({ outcome: "release", note: "Work done, checked with the customer." });
    expect(rel.body.status).toBe("completed");
    expect(rel.body.confirmed_by).toBe("ops");
    expect((await payoutPosition(o2.g1.merchantId)).payableOrders.map((x) => x.id)).toEqual([o2.orderId]);
  });
});

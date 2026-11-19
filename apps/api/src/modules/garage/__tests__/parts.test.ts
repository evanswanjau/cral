import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { commissionRateFor, takeHome } from "../../../lib/commission.js";
import { createTestAdmin, createVerifiedTestUser } from "../../../test/helpers.js";
import { handleCallback } from "../../payments/service.js";
import { cutPayoutRun, payoutPosition } from "../../payouts/service.js";
import { autoConfirmReadyOrders } from "../orders.js";

/**
 * Spare parts (Phase 5 PT1, docs/decisions/parts.md). Parts outlets, a
 * parts request against a car's chassis, quotes that name condition and
 * fitted/delivered (a delivered part priced with a delivery line), accept
 * -> pay through the shared settlement -> delivered -> "right part" or a
 * wrong-part dispute that Ops settles -> one payout line through
 * `cutPayoutRun`. Same order engine as garage jobs, the parts commission.
 */

const app = createApp();
const userIds: string[] = [];
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

const TEST_ADDRESS = "Spares Lane (parts test)";
const SPARE = ["Lamu", "Tana River", "Marsabit", "Isiolo", "Samburu", "Turkana", "Mandera", "Wajir", "Garissa", "Tharaka-Nithi", "Elgeyo-Marakwet", "Nandi"];
let COUNTY = SPARE[0]!;
let next = 0;
beforeEach(async () => {
  COUNTY = SPARE[next++ % SPARE.length]!;
  await db("outlets").where({ county: COUNTY }).whereIn("address", [TEST_ADDRESS]).update({ status: "paused" });
});

async function user() {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  return u;
}

async function merchantWith(kind: "garage" | "parts") {
  const owner = await user();
  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: owner.userId,
    owner_type: "individual",
    first_name: "Parts",
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
  const outletId = generateId("outlet");
  await db("outlets").insert({
    id: outletId,
    merchant_id: merchantId,
    kind,
    name: `${kind === "parts" ? "Spares" : "Garage"} ${ulid().slice(-5)}`,
    address: TEST_ADDRESS,
    county: COUNTY,
    opening_hours: "Mon to Sat, 8am to 6pm",
    service_types: kind === "garage" ? ["service"] : [],
    status: "live",
    decided_at: new Date(),
  });
  return { token: owner.accessToken, merchantId, outletId };
}

async function customerWithCar(chassis: string | null = `JTD${ulid().slice(-10)}`) {
  const c = await user();
  const car = await request(app)
    .post("/me/cars")
    .set(bearer(c.accessToken))
    .send({ make: "Toyota", model: "Fielder", year: 2016, plate: `KD${ulid().slice(-5)}`, chassis_number: chassis });
  expect(car.status).toBe(201);
  return { c, carId: car.body.id as string };
}

const PART_REQUEST = {
  part_name: "Front brake pads",
  description: "Both sides, the original pads are worn to the metal.",
  delivery_address: "Kilimani, Argwings Kodhek Road, Gate 4",
};

const DELIVERED = {
  lines: [
    { kind: "part", description: "Brake pads, front pair", amount: 450000 },
    { kind: "delivery", description: "Delivery to Kilimani", amount: 50000 },
  ],
  days_needed: 1,
  part_condition: "genuine",
  fulfilment: "delivered",
};

async function partsRequest() {
  const d = await merchantWith("parts");
  const g = await merchantWith("garage");
  const { c, carId } = await customerWithCar();
  const res = await request(app).post("/me/parts-requests").set(bearer(c.accessToken)).send({ car_id: carId, county: COUNTY, ...PART_REQUEST });
  expect(res.status).toBe(201);
  return { d, g, c, carId, requestId: res.body.id as string, body: res.body };
}

async function settle(orderId: string) {
  const pr = await db("payment_requests").where({ order_id: orderId }).orderBy("created_at", "desc").first();
  await handleCallback(
    { reference: pr.provider_request_id, succeeded: true, receipt: `R${ulid().slice(-8)}`, amountShillings: Math.round(pr.amount_amount / 100) },
    { ip: null, requestId: null },
  );
}

async function paidPartOrder(quote: Record<string, unknown> = DELIVERED) {
  const r = await partsRequest();
  const sent = await request(app).post(`/merchant/garage-requests/${r.requestId}/quote`).set(bearer(r.d.token)).send(quote);
  expect(sent.status).toBe(200);
  const quoteId = sent.body.my_quote.id as string;
  const acc = await request(app).post(`/me/garage-requests/${r.requestId}/quotes/${quoteId}/accept`).set(bearer(r.c.accessToken)).set(idem());
  expect(acc.status).toBe(201);
  const orderId = acc.body.id as string;
  expect((await request(app).post(`/me/garage-orders/${orderId}/pay`).set(bearer(r.c.accessToken)).set(idem()).send({ phone: "0712345678" })).status).toBe(202);
  await settle(orderId);
  return { ...r, quoteId, orderId };
}

describe("parts outlets", () => {
  it("a merchant can add a parts outlet, which carries no service types", async () => {
    const owner = await user();
    const res = await request(app)
      .post("/merchant/outlets")
      .set(bearer(owner.accessToken))
      .send({ kind: "parts", name: "Spares House", address: "Kirinyaga Road, shop 12", county: COUNTY, opening_hours: "Mon to Sat, 8am to 6pm", service_types: ["service"] });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("parts");
    expect(res.body.service_types).toEqual([]);
    await db("outlets").where({ id: res.body.id }).delete();
  });
});

describe("parts requests", () => {
  it("go to parts dealers in the county only, with the part and the delivery address", async () => {
    const r = await partsRequest();
    expect(r.body.kind).toBe("part");
    expect(r.body.part_name).toBe(PART_REQUEST.part_name);
    expect(r.body.delivery_address).toBe(PART_REQUEST.delivery_address);
    expect(r.body.service_type).toBeNull();
    const targets = await db("quote_request_outlets").where({ request_id: r.requestId });
    expect(targets.map((t) => t.outlet_id)).toEqual([r.d.outletId]);
    expect(await db("audit_log").where({ entity_id: r.requestId, action: "parts_request.created" }).first()).toBeTruthy();

    // The dealer sees the chassis and the address; the garage doesn't see it at all.
    const asDealer = await request(app).get(`/merchant/garage-requests/${r.requestId}`).set(bearer(r.d.token));
    expect(asDealer.status).toBe(200);
    expect(asDealer.body.car.chassis_number).toMatch(/^JTD/);
    expect(asDealer.body.delivery_address).toBe(PART_REQUEST.delivery_address);
    expect((await request(app).get(`/merchant/garage-requests/${r.requestId}`).set(bearer(r.g.token))).status).toBe(404);

    // The customer's lists keep garage and parts apart.
    const parts = await request(app).get(`/me/garage-requests?kind=part`).set(bearer(r.c.accessToken));
    expect(parts.body.data.map((x: { id: string }) => x.id)).toEqual([r.requestId]);
    const garage = await request(app).get(`/me/garage-requests`).set(bearer(r.c.accessToken));
    expect(garage.body.data).toHaveLength(0);
  });

  it("needs the car's chassis number and a dealer in the county", async () => {
    await merchantWith("parts");
    const noChassis = await customerWithCar(null);
    const a = await request(app).post("/me/parts-requests").set(bearer(noChassis.c.accessToken)).send({ car_id: noChassis.carId, county: COUNTY, ...PART_REQUEST });
    expect(a.status).toBe(422);
    expect(a.body.error.code).toBe("car_needs_chassis");

    const { c, carId } = await customerWithCar();
    const b = await request(app).post("/me/parts-requests").set(bearer(c.accessToken)).send({ car_id: carId, county: "Nyamira", ...PART_REQUEST });
    expect(b.status).toBe(422);
    expect(b.body.error.code).toBe("no_dealers_in_county");

    const missing = await request(app).post("/me/parts-requests").set(bearer(c.accessToken)).send({ car_id: carId, county: COUNTY, part_name: "Pads", description: "Front pads please, both sides." });
    expect(missing.status).toBe(422);
  });
});

describe("parts quotes", () => {
  it("must name the condition and fitted or delivered, with a delivery line only when delivered", async () => {
    const r = await partsRequest();
    const url = `/merchant/garage-requests/${r.requestId}/quote`;
    const noCondition = await request(app).post(url).set(bearer(r.d.token)).send({ ...DELIVERED, part_condition: undefined });
    expect(noCondition.body.error.code).toBe("part_condition_required");
    const noFulfilment = await request(app).post(url).set(bearer(r.d.token)).send({ ...DELIVERED, fulfilment: undefined });
    expect(noFulfilment.body.error.code).toBe("fulfilment_required");
    const noDelivery = await request(app).post(url).set(bearer(r.d.token)).send({ ...DELIVERED, lines: [DELIVERED.lines[0]] });
    expect(noDelivery.status).toBe(422);
    expect(noDelivery.body.error.code).toBe("delivery_line_required");
    const fittedWithDelivery = await request(app).post(url).set(bearer(r.d.token)).send({ ...DELIVERED, fulfilment: "fitted" });
    expect(fittedWithDelivery.body.error.code).toBe("delivery_line_not_needed");

    const ok = await request(app).post(url).set(bearer(r.d.token)).send(DELIVERED);
    expect(ok.status).toBe(200);
    expect(ok.body.my_quote.part_condition).toBe("genuine");
    expect(ok.body.my_quote.fulfilment).toBe("delivered");
    // Take-home in shillings at the parts rate; never the rate itself.
    expect(ok.body.my_quote.take_home.amount).toBe(takeHome(500000, await commissionRateFor("parts")));
    expect(JSON.stringify(ok.body)).not.toMatch(/commission/i);

    const view = await request(app).get(`/me/garage-requests/${r.requestId}`).set(bearer(r.c.accessToken));
    expect(view.body.quotes[0].part_condition).toBe("genuine");
    expect(view.body.quotes[0].fulfilment).toBe("delivered");
  });

  it("a garage quote can't name parts fields", async () => {
    const g = await merchantWith("garage");
    const { c, carId } = await customerWithCar();
    const req = await request(app).post("/me/garage-requests").set(bearer(c.accessToken)).send({ car_id: carId, service_type: "service", description: "Full service and oil change please.", county: COUNTY });
    expect(req.status).toBe(201);
    const res = await request(app).post(`/merchant/garage-requests/${req.body.id}/quote`).set(bearer(g.token)).send(DELIVERED);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("not_a_parts_request");
  });

  it("the preview uses the parts rate when asked", async () => {
    const d = await merchantWith("parts");
    const res = await request(app).post("/merchant/garage-requests/quote-preview").set(bearer(d.token)).send({ kind: "part", lines: DELIVERED.lines });
    expect(res.body.take_home.amount).toBe(takeHome(500000, await commissionRateFor("parts")));
  });
});

describe("part orders", () => {
  it("accept snapshots the parts commission and gives a P- ref; delivered -> right part -> one payout line", async () => {
    const o = await paidPartOrder();
    let order = await db("orders").where({ id: o.orderId }).first();
    expect(order.kind).toBe("part");
    expect(order.ref).toMatch(/^P-\d{6}-\d{3}$/);
    expect(order.status).toBe("paid");
    expect(order.gross_amount).toBe(500000);
    expect(order.merchant_net_amount).toBe(takeHome(500000, await commissionRateFor("parts")));
    const quote = await db("quotes").where({ id: o.quoteId }).first();
    expect(quote.commission_amount).toBe(order.commission_amount);

    // No extra-work quotes on a part.
    const extra = await request(app).post(`/merchant/garage-orders/${o.orderId}/extras`).set(bearer(o.d.token)).send({ lines: [{ kind: "other", description: "More", amount: 1000 }], days_needed: 1 });
    expect(extra.status).toBe(409);
    expect(extra.body.error.code).toBe("not_for_parts");

    // Can't confirm before it's delivered.
    expect((await request(app).post(`/me/garage-orders/${o.orderId}/confirm`).set(bearer(o.c.accessToken)).set(idem())).status).toBe(409);

    // Delivered straight from paid.
    const delivered = await request(app).post(`/merchant/garage-orders/${o.orderId}/ready`).set(bearer(o.d.token));
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe("ready");
    expect(delivered.body.fulfilment).toBe("delivered");
    expect(delivered.body.delivery_address).toBe(PART_REQUEST.delivery_address);
    expect(delivered.body).not.toHaveProperty("commission");
    expect(await db("audit_log").where({ entity_id: o.orderId, action: "order.delivered" }).first()).toBeTruthy();
    // Delivered twice is a conflict.
    expect((await request(app).post(`/merchant/garage-orders/${o.orderId}/ready`).set(bearer(o.d.token))).status).toBe(409);

    const customer = await request(app).get(`/me/garage-orders/${o.orderId}`).set(bearer(o.c.accessToken));
    expect(customer.body.kind).toBe("part");
    expect(customer.body.part_name).toBe(PART_REQUEST.part_name);
    expect(customer.body.auto_confirm_at).toBeTruthy();
    const mine = await request(app).get(`/me/garage-orders?kind=part`).set(bearer(o.c.accessToken));
    expect(mine.body.data.map((x: { id: string }) => x.id)).toEqual([o.orderId]);

    const noKey = await request(app).post(`/me/garage-orders/${o.orderId}/confirm`).set(bearer(o.c.accessToken));
    expect(noKey.status).toBe(400);
    const right = await request(app).post(`/me/garage-orders/${o.orderId}/confirm`).set(bearer(o.c.accessToken)).set(idem());
    expect(right.status).toBe(200);
    expect(right.body.status).toBe("completed");
    expect(right.body.confirmed_by).toBe("customer");
    expect(await db("audit_log").where({ entity_id: o.orderId, action: "order.right_part_confirmed" }).first()).toBeTruthy();

    order = await db("orders").where({ id: o.orderId }).first();
    const position = await payoutPosition(o.d.merchantId);
    expect(position.payableOrders.map((x) => x.id)).toEqual([o.orderId]);
    const dest = { method: "mpesa", detail: "0712345678", accountName: "Parts Owner" };
    const run = await db.transaction((trx) => cutPayoutRun(trx, o.d.merchantId, dest));
    expect(run).not.toBeNull();
    expect(run!.net_amount).toBe(order.merchant_net_amount);
    const lines = await db("payout_run_lines").where({ payout_run_id: run!.id });
    expect(lines).toHaveLength(1);
    expect(lines[0].order_id).toBe(o.orderId);
    expect(lines[0].booking_ref).toBe(order.ref);
    expect(lines[0].gross_amount).toBe(500000);
    expect(await db.transaction((trx) => cutPayoutRun(trx, o.d.merchantId, dest))).toBeNull();
  });

  it("a fitted part is marked fitted, and auto-confirms 72 h later", async () => {
    const o = await paidPartOrder({ lines: [{ kind: "part", description: "Alternator, used", amount: 800000 }, { kind: "labour", description: "Fitting", amount: 100000 }], days_needed: 1, part_condition: "used", fulfilment: "fitted" });
    const fitted = await request(app).post(`/merchant/garage-orders/${o.orderId}/ready`).set(bearer(o.d.token));
    expect(fitted.body.fulfilment).toBe("fitted");
    expect(await db("audit_log").where({ entity_id: o.orderId, action: "order.fitted" }).first()).toBeTruthy();
    expect(await autoConfirmReadyOrders(new Date(), [o.orderId])).toBe(0);
    await db("orders").where({ id: o.orderId }).update({ ready_at: new Date(Date.now() - 73 * 3600_000) });
    expect(await autoConfirmReadyOrders(new Date(), [o.orderId])).toBe(1);
    const order = await db("orders").where({ id: o.orderId }).first();
    expect(order.status).toBe("completed");
    expect(order.confirmed_by).toBe("auto");
  });

  it("an unpaid part order can't be marked delivered", async () => {
    const r = await partsRequest();
    const sent = await request(app).post(`/merchant/garage-requests/${r.requestId}/quote`).set(bearer(r.d.token)).send(DELIVERED);
    const acc = await request(app).post(`/me/garage-requests/${r.requestId}/quotes/${sent.body.my_quote.id}/accept`).set(bearer(r.c.accessToken)).set(idem());
    const res = await request(app).post(`/merchant/garage-orders/${acc.body.id}/ready`).set(bearer(r.d.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("order_not_paid");
  });
});

describe("wrong-part disputes", () => {
  it("stop the auto-confirm, reach Ops under the parts filter, and Ops refunds", async () => {
    const o = await paidPartOrder();
    // Not before it's handed over.
    const early = await request(app).post(`/me/garage-orders/${o.orderId}/problem`).set(bearer(o.c.accessToken)).send({ note: "This is the wrong part for my car." });
    expect(early.status).toBe(409);
    await request(app).post(`/merchant/garage-orders/${o.orderId}/ready`).set(bearer(o.d.token));
    const dispute = await request(app).post(`/me/garage-orders/${o.orderId}/problem`).set(bearer(o.c.accessToken)).send({ note: "These are rear pads, I asked for front ones." });
    expect(dispute.status).toBe(200);
    expect(dispute.body.status).toBe("problem");
    expect(await db("audit_log").where({ entity_id: o.orderId, action: "order.wrong_part_disputed" }).first()).toBeTruthy();
    await db("orders").where({ id: o.orderId }).update({ ready_at: new Date(Date.now() - 80 * 3600_000) });
    expect(await autoConfirmReadyOrders(new Date(), [o.orderId])).toBe(0);
    expect((await request(app).post(`/me/garage-orders/${o.orderId}/confirm`).set(bearer(o.c.accessToken)).set(idem())).status).toBe(409);

    const support = await createTestAdmin("admin_support");
    adminIds.push(support.adminId);
    const parts = await request(app).get(`/admin/garage-orders?status=problem&kind=part&limit=100`).set(bearer(support.token));
    expect(parts.status).toBe(200);
    const found = parts.body.data.find((x: { id: string }) => x.id === o.orderId);
    expect(found).toBeTruthy();
    expect(found.kind).toBe("part");
    expect(found.problem_note).toMatch(/rear pads/);
    const garageOnly = await request(app).get(`/admin/garage-orders?status=problem&kind=service&limit=100`).set(bearer(support.token));
    expect(garageOnly.body.data.find((x: { id: string }) => x.id === o.orderId)).toBeUndefined();

    const res = await request(app).post(`/admin/garage-orders/${o.orderId}/resolve`).set(bearer(support.token)).set(idem()).send({ outcome: "refund", note: "Wrong part sent; refunded in full." });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("refunded");
    const refunds = await db("refunds").where({ order_id: o.orderId });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].reason).toBe("order_refunded");
    expect((await payoutPosition(o.d.merchantId)).payableOrders).toHaveLength(0);
    expect(await db("audit_log").where({ entity_id: o.orderId, action: "order.problem_refunded" }).first()).toBeTruthy();
  });

  it("Ops can release a disputed part to the dealer, which then pays out once", async () => {
    const o = await paidPartOrder();
    await request(app).post(`/merchant/garage-orders/${o.orderId}/ready`).set(bearer(o.d.token));
    await request(app).post(`/me/garage-orders/${o.orderId}/problem`).set(bearer(o.c.accessToken)).send({ note: "I think this is the wrong part number." });
    const support = await createTestAdmin("admin_support");
    adminIds.push(support.adminId);
    const rel = await request(app).post(`/admin/garage-orders/${o.orderId}/resolve`).set(bearer(support.token)).set(idem()).send({ outcome: "release", note: "Checked the part number: it is right." });
    expect(rel.body.status).toBe("completed");
    expect(rel.body.confirmed_by).toBe("ops");
    expect((await payoutPosition(o.d.merchantId)).payableOrders.map((x) => x.id)).toEqual([o.orderId]);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";
import { handleCallback } from "../../payments/service.js";

/**
 * The service record (Phase 4 GS4). A completed garage job stays on the
 * customer's car; the customer sees every garage's completed work on it,
 * a garage sees only its own, and neither sees an unfinished or cancelled
 * job there. Nothing about CRAL's fee reaches the garage.
 */

const app = createApp();
const userIds: string[] = [];

afterAll(async () => {
  const orderIds = (await db("orders").whereIn("user_id", userIds).pluck("id")) as string[];
  if (orderIds.length) {
    await db("payment_requests").whereIn("order_id", orderIds).delete();
    await db("quotes").whereIn("order_id", orderIds).where({ kind: "extra" }).delete();
    await db("quotes").whereIn("order_id", orderIds).update({ order_id: null });
    await db("orders").whereIn("id", orderIds).delete();
  }
  if (userIds.length) {
    await db("quote_requests").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": ulid() });

const TEST_ADDRESS = "Workshop Road (service record test)";
const SPARE = ["Nyamira", "Kericho", "Nandi", "Kisii", "Migori", "Homa Bay"];
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

type Garage = Awaited<ReturnType<typeof garage>>;

/** A request on `carId` that only `g` is asked about (the others paused), quoted, accepted and paid. */
async function paidJob(customer: string, carId: string, g: Garage, others: Garage[]) {
  for (const o of others) await db("outlets").where({ id: o.outletId }).update({ status: "paused" });
  await db("outlets").where({ id: g.outletId }).update({ status: "live" });
  const req = await request(app)
    .post("/me/garage-requests")
    .set(bearer(customer))
    .send({ car_id: carId, service_type: "service", description: "Full service and an oil change, please.", county: COUNTY });
  expect(req.status).toBe(201);
  const sent = await request(app)
    .post(`/merchant/garage-requests/${req.body.id}/quote`)
    .set(bearer(g.token))
    .send({
      lines: [
        { kind: "part", description: "Oil filter", amount: 120000 },
        { kind: "labour", description: "Service", amount: 300000 },
      ],
      days_needed: 1,
    });
  expect(sent.status).toBe(200);
  const quotes = (await request(app).get(`/me/garage-requests/${req.body.id}`).set(bearer(customer))).body.quotes as Array<{ id: string }>;
  const acc = await request(app).post(`/me/garage-requests/${req.body.id}/quotes/${quotes[0]!.id}/accept`).set(bearer(customer)).set(idem());
  expect(acc.status).toBe(201);
  const orderId = acc.body.id as string;
  expect((await request(app).post(`/me/garage-orders/${orderId}/pay`).set(bearer(customer)).set(idem()).send({ phone: "0712345678" })).status).toBe(202);
  const pr = await db("payment_requests").where({ order_id: orderId }).orderBy("created_at", "desc").first();
  await handleCallback(
    { reference: pr.provider_request_id, succeeded: true, receipt: `R${ulid().slice(-8)}`, amountShillings: Math.round(pr.amount_amount / 100) },
    { ip: null, requestId: null },
  );
  return orderId;
}

async function finish(orderId: string, customer: string, g: Garage) {
  expect((await request(app).post(`/merchant/garage-orders/${orderId}/start`).set(bearer(g.token))).status).toBe(200);
  expect((await request(app).post(`/merchant/garage-orders/${orderId}/ready`).set(bearer(g.token))).status).toBe(200);
  expect((await request(app).post(`/me/garage-orders/${orderId}/confirm`).set(bearer(customer)).set(idem())).status).toBe(200);
}

const ids = (body: { data: Array<{ order_id: string }> }) => body.data.map((e) => e.order_id);

describe("the service record", () => {
  it("keeps completed jobs on the car; each garage sees only its own", async () => {
    const g1 = await garage();
    const g2 = await garage();
    const c = await user();
    const car = await request(app)
      .post("/me/cars")
      .set(bearer(c.accessToken))
      .send({ make: "Toyota", model: "Fielder", year: 2016, plate: `KD${ulid().slice(-5)}` });
    expect(car.status).toBe(201);
    const carId = car.body.id as string;

    const empty = await request(app).get(`/me/cars/${carId}/service-record`).set(bearer(c.accessToken));
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);
    expect(empty.body.car.id).toBe(carId);

    const first = await paidJob(c.accessToken, carId, g1, [g2]);
    // Paid but not done: not on the record yet.
    expect((await request(app).get(`/me/cars/${carId}/service-record`).set(bearer(c.accessToken))).body.data).toEqual([]);
    await finish(first, c.accessToken, g1);

    const second = await paidJob(c.accessToken, carId, g2, [g1]);
    await finish(second, c.accessToken, g2);

    // The customer sees both, latest first, line by line.
    const mine = await request(app).get(`/me/cars/${carId}/service-record`).set(bearer(c.accessToken));
    expect(mine.status).toBe(200);
    expect(ids(mine.body)).toEqual([second, first]);
    const entry = mine.body.data[1];
    expect(entry.ref).toMatch(/^G-\d{6}-\d{3}$/);
    expect(entry.confirmed_by).toBe("customer");
    expect(entry.total).toEqual({ amount: 420000, currency: "KES" });
    expect(entry.work).toHaveLength(1);
    expect(entry.work[0].kind).toBe("original");
    expect(entry.work[0].lines.map((l: { description: string }) => l.description)).toEqual(["Oil filter", "Service"]);
    expect(entry.outlet.county).toBe(COUNTY);

    // Cursor paging on completed_at.
    const p1 = await request(app).get(`/me/cars/${carId}/service-record?limit=1`).set(bearer(c.accessToken));
    expect(p1.body.has_more).toBe(true);
    const p2 = await request(app)
      .get(`/me/cars/${carId}/service-record?limit=1&cursor=${p1.body.next_cursor}`)
      .set(bearer(c.accessToken));
    expect(ids(p2.body)).toEqual([first]);

    // Garage 1 sees only its own job on the car, and no fee figures.
    const g1View = await request(app).get(`/merchant/garage-orders/${first}/service-record`).set(bearer(g1.token));
    expect(g1View.status).toBe(200);
    expect(ids(g1View.body)).toEqual([first]);
    expect(g1View.body.data[0].take_home.amount).toBeGreaterThan(0);
    expect(g1View.body.data[0].take_home.amount).toBeLessThanOrEqual(420000);
    expect(JSON.stringify(g1View.body)).not.toMatch(/"commission|"rate"/);

    // Garage 2 can't reach it through garage 1's order, and sees only its own.
    expect((await request(app).get(`/merchant/garage-orders/${first}/service-record`).set(bearer(g2.token))).status).toBe(404);
    const g2View = await request(app).get(`/merchant/garage-orders/${second}/service-record`).set(bearer(g2.token));
    expect(ids(g2View.body)).toEqual([second]);
  });

  it("is the owner's alone: another customer's car is 404", async () => {
    const c = await user();
    const other = await user();
    const car = await request(app)
      .post("/me/cars")
      .set(bearer(c.accessToken))
      .send({ make: "Honda", model: "Fit", year: 2014, plate: `KC${ulid().slice(-5)}` });
    const res = await request(app).get(`/me/cars/${car.body.id}/service-record`).set(bearer(other.accessToken));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("car_not_found");
    expect((await request(app).get(`/me/cars/${car.body.id}/service-record`)).status).toBe(401);
  });

  it("leaves a cancelled job off the record", async () => {
    const g = await garage();
    const c = await user();
    const car = await request(app)
      .post("/me/cars")
      .set(bearer(c.accessToken))
      .send({ make: "Nissan", model: "Note", year: 2017, plate: `KB${ulid().slice(-5)}` });
    const req = await request(app)
      .post("/me/garage-requests")
      .set(bearer(c.accessToken))
      .send({ car_id: car.body.id, service_type: "service", description: "Check the brakes before a long trip.", county: COUNTY });
    expect(req.status).toBe(201);
    await request(app)
      .post(`/merchant/garage-requests/${req.body.id}/quote`)
      .set(bearer(g.token))
      .send({ lines: [{ kind: "labour", description: "Brake check", amount: 150000 }], days_needed: 1 });
    const quotes = (await request(app).get(`/me/garage-requests/${req.body.id}`).set(bearer(c.accessToken))).body.quotes as Array<{ id: string }>;
    const acc = await request(app).post(`/me/garage-requests/${req.body.id}/quotes/${quotes[0]!.id}/accept`).set(bearer(c.accessToken)).set(idem());
    expect((await request(app).post(`/me/garage-orders/${acc.body.id}/cancel`).set(bearer(c.accessToken)).set(idem())).status).toBe(200);
    const res = await request(app).get(`/me/cars/${car.body.id}/service-record`).set(bearer(c.accessToken));
    expect(res.body.data).toEqual([]);
  });
});

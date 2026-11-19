import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";

/**
 * Garage quotes (Phase 4 GS2). The state rules: a request goes only to
 * live garages of approved merchants in the county that do the service,
 * one per merchant, at most 5; a merchant sees only what its garage was
 * asked; quotes total their lines, revise in place and expire after 48 h;
 * nothing can be quoted on a closed request; the fee rate never reaches a
 * merchant.
 */

const app = createApp();
const userIds: string[] = [];

afterAll(async () => {
  if (userIds.length) {
    await db("quote_requests").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

// Each test works in its own county no other test file uses, so the
// picker (at most 5, oldest approval first) only sees that test's garages.
const TEST_ADDRESS = "Main Street, by the market (garage test)";
const SPARE = ["Marsabit", "Isiolo", "Samburu", "Turkana", "Wajir", "Mandera", "Garissa", "Tana River"];
let COUNTY = SPARE[0]!;
let next = 0;
beforeEach(async () => {
  COUNTY = SPARE[next++]!;
  // Leftovers from an interrupted earlier run would crowd the picker.
  await db("outlets").where({ county: COUNTY, address: TEST_ADDRESS }).delete();
});

async function user() {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  return u;
}

async function garage(opts: { approved?: boolean; status?: string; services?: string[]; county?: string } = {}) {
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
    approved_at: opts.approved === false ? null : new Date(),
  });
  const outletId = generateId("outlet");
  await db("outlets").insert({
    id: outletId,
    merchant_id: merchantId,
    kind: "garage",
    name: `Garage ${ulid().slice(-5)}`,
    address: TEST_ADDRESS,
    county: opts.county ?? COUNTY,
    opening_hours: "Mon to Sat, 8am to 6pm",
    service_types: opts.services ?? ["service", "mechanical"],
    status: opts.status ?? "live",
    decided_at: new Date(),
    visited_on: "2026-11-01",
    visited_by: "Jane Wambui",
  });
  return { token: owner.accessToken, merchantId, outletId };
}

async function customerWithCar() {
  const c = await user();
  const car = await request(app)
    .post("/me/cars")
    .set(bearer(c.accessToken))
    .send({ make: "Toyota", model: "Fielder", year: 2014, plate: "kda 123b", chassis_number: "nze1613456789" });
  expect(car.status).toBe(201);
  return { token: c.accessToken, carId: car.body.id as string };
}

async function ask(token: string, carId: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post("/me/garage-requests")
    .set(bearer(token))
    .send({ car_id: carId, service_type: "service", description: "Full service due, and a squeak from the front left.", county: COUNTY, ...extra });
}

const LINES = [
  { kind: "part", description: "Oil filter", amount: 120000 },
  { kind: "labour", description: "Service labour", amount: 300000 },
];

describe("My cars", () => {
  it("adds a car, keeps the plate unique per customer, and won't remove a car with requests", async () => {
    const c = await customerWithCar();
    const again = await request(app).post("/me/cars").set(bearer(c.token)).send({ make: "Toyota", model: "Fielder", year: 2014, plate: "KDA 123B" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("car_exists");

    // Another customer may have the same plate.
    const other = await user();
    const same = await request(app).post("/me/cars").set(bearer(other.accessToken)).send({ make: "Toyota", model: "Fielder", year: 2014, plate: "KDA123B" });
    expect(same.status).toBe(201);

    await garage();
    expect((await ask(c.token, c.carId)).status).toBe(201);
    const del = await request(app).delete(`/me/cars/${c.carId}`).set(bearer(c.token));
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("car_has_requests");

    expect((await request(app).delete(`/me/cars/${same.body.id}`).set(bearer(other.accessToken))).status).toBe(204);
  });
});

describe("garage requests", () => {
  it("asks only live garages of approved merchants that do the service, and says when there are none", async () => {
    const c = await customerWithCar();
    const none = await ask(c.token, c.carId, { county: "Lamu" });
    expect(none.status).toBe(422);
    expect(none.body.error.code).toBe("no_garages_in_county");

    const good = await garage();
    const unapproved = await garage({ approved: false });
    const paused = await garage({ status: "paused" });
    const noService = await garage({ services: ["tyres"] });

    const res = await ask(c.token, c.carId);
    expect(res.status).toBe(201);
    const asked = await db("quote_request_outlets").where({ request_id: res.body.id }).pluck("outlet_id");
    expect(asked).toContain(good.outletId);
    for (const o of [unapproved, paused, noService]) expect(asked).not.toContain(o.outletId);
    expect(asked.length).toBeLessThanOrEqual(5);
    expect(await db("audit_log").where({ entity_id: res.body.id, action: "garage_request.created" }).first()).toBeTruthy();

    const notice = await db("notifications").where({ merchant_id: good.merchantId, subject_type: "garage_request", subject_id: res.body.id }).first();
    expect(notice).toBeTruthy();
  });

  it("shows the chassis number only to an asked garage, and never the fee rate", async () => {
    const g = await garage();
    const stranger = await garage({ county: "Lamu" });
    const c = await customerWithCar();
    const r = await ask(c.token, c.carId);

    const seen = await request(app).get(`/merchant/garage-requests/${r.body.id}`).set(bearer(g.token));
    expect(seen.status).toBe(200);
    expect(seen.body.car.chassis_number).toBe("NZE1613456789");
    expect((await request(app).get(`/merchant/garage-requests/${r.body.id}`).set(bearer(stranger.token))).status).toBe(404);

    const preview = await request(app).post("/merchant/garage-requests/quote-preview").set(bearer(g.token)).send({ lines: LINES });
    expect(preview.body.total.amount).toBe(420000);
    expect(preview.body.take_home.amount).toBeLessThan(420000);
    expect(JSON.stringify(preview.body)).not.toMatch(/rate|percent|commission/i);
  });

  it("sends, revises and withdraws a quote; the customer sees sent quotes cheapest first", async () => {
    const a = await garage();
    const b = await garage();
    const c = await customerWithCar();
    const r = await ask(c.token, c.carId);

    const empty = await request(app).post(`/merchant/garage-requests/${r.body.id}/quote`).set(bearer(a.token)).send({ lines: [], days_needed: 1 });
    expect(empty.status).toBe(422);

    const sent = await request(app).post(`/merchant/garage-requests/${r.body.id}/quote`).set(bearer(a.token)).send({ lines: LINES, days_needed: 1 });
    expect(sent.status).toBe(200);
    expect(sent.body.my_quote).toMatchObject({ status: "sent", total: { amount: 420000 }, expired: false });
    const firstValid = sent.body.my_quote.valid_until;

    await request(app)
      .post(`/merchant/garage-requests/${r.body.id}/quote`)
      .set(bearer(b.token))
      .send({ lines: [{ kind: "labour", description: "Service", amount: 350000 }], days_needed: 2 });

    const revised = await request(app)
      .post(`/merchant/garage-requests/${r.body.id}/quote`)
      .set(bearer(a.token))
      .send({ lines: [...LINES, { kind: "part", description: "Brake pads", amount: 450000 }], days_needed: 2, note: "Pads are worn." });
    expect(revised.body.my_quote.total.amount).toBe(870000);
    expect(revised.body.my_quote.lines).toHaveLength(3);
    expect(revised.body.my_quote.valid_until >= firstValid).toBe(true);
    expect(await db("audit_log").where({ entity_id: revised.body.my_quote.id, action: "quote.revised" }).first()).toBeTruthy();

    const view = await request(app).get(`/me/garage-requests/${r.body.id}`).set(bearer(c.token));
    expect(view.body.quotes.map((q: { total: { amount: number } }) => q.total.amount)).toEqual([350000, 870000]);
    expect(view.body.quotes[0].outlet.visited_on).toBe("2026-11-01");

    await request(app).post(`/merchant/garage-requests/${r.body.id}/quote/withdraw`).set(bearer(a.token));
    const after = await request(app).get(`/me/garage-requests/${r.body.id}`).set(bearer(c.token));
    expect(after.body.quote_count).toBe(1);
  });

  it("reads a quote past 48 hours as expired", async () => {
    const g = await garage();
    const c = await customerWithCar();
    const r = await ask(c.token, c.carId);
    await request(app).post(`/merchant/garage-requests/${r.body.id}/quote`).set(bearer(g.token)).send({ lines: LINES, days_needed: 1 });
    await db("quotes").where({ request_id: r.body.id }).update({ valid_until: new Date(Date.now() - 1000) });
    const view = await request(app).get(`/me/garage-requests/${r.body.id}`).set(bearer(c.token));
    expect(view.body.quotes[0].expired).toBe(true);
  });

  it("stops quoting once the customer cancels, and a decline withdraws the quote", async () => {
    const g = await garage();
    const g2 = await garage();
    const c = await customerWithCar();
    const r = await ask(c.token, c.carId);

    await request(app).post(`/merchant/garage-requests/${r.body.id}/quote`).set(bearer(g2.token)).send({ lines: LINES, days_needed: 1 });
    const declined = await request(app).post(`/merchant/garage-requests/${r.body.id}/decline`).set(bearer(g2.token));
    expect(declined.body.declined).toBe(true);
    expect(declined.body.my_quote.status).toBe("withdrawn");
    const blocked = await request(app).post(`/merchant/garage-requests/${r.body.id}/quote`).set(bearer(g2.token)).send({ lines: LINES, days_needed: 1 });
    expect(blocked.body.error.code).toBe("request_declined");

    const cancel = await request(app).post(`/me/garage-requests/${r.body.id}/cancel`).set(bearer(c.token));
    expect(cancel.body.status).toBe("cancelled");
    expect((await request(app).post(`/me/garage-requests/${r.body.id}/cancel`).set(bearer(c.token))).status).toBe(409);

    const late = await request(app).post(`/merchant/garage-requests/${r.body.id}/quote`).set(bearer(g.token)).send({ lines: LINES, days_needed: 1 });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("request_not_open");

    const list = await request(app).get("/merchant/garage-requests?filter=closed").set(bearer(g.token));
    expect(list.body.data.map((x: { id: string }) => x.id)).toContain(r.body.id);
  });

  it("won't let a paused garage quote", async () => {
    const g = await garage();
    const c = await customerWithCar();
    const r = await ask(c.token, c.carId);
    await db("outlets").where({ id: g.outletId }).update({ status: "paused" });
    const res = await request(app).post(`/merchant/garage-requests/${r.body.id}/quote`).set(bearer(g.token)).send({ lines: LINES, days_needed: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("outlet_not_live");
  });
});

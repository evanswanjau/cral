import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";
import { computeBookingPricing } from "../../../lib/booking-pricing.js";
import { expireStaleBookingRequests } from "../../bookings/service.js";

/**
 * Quotes and per-km / per-tonne trucks (PR T3 of
 * docs/plans/trucks-and-sales-agents.md). The load-bearing behaviour: a
 * request on a quoted listing goes out unpriced, the merchant's quote sets
 * the money once, the renter's accept goes straight to `confirmed`, and a
 * quote that sits unanswered lapses on its own 48-hour clock.
 */

const app = createApp();
const userIds: string[] = [];
const merchantIds: string[] = [];

afterAll(async () => {
  if (merchantIds.length) {
    const bookingIds = db("bookings").whereIn("merchant_id", merchantIds).select("id");
    await db("booking_events").whereIn("booking_id", bookingIds).delete();
    await db("bookings").whereIn("merchant_id", merchantIds).delete();
    await db("vehicle_events").whereIn("merchant_id", merchantIds).delete();
    await db("notifications").whereIn("merchant_id", merchantIds).delete();
    await db("vehicles").whereIn("merchant_id", merchantIds).delete();
    await db("merchants").whereIn("id", merchantIds).delete();
  }
  if (userIds.length) {
    await db("notifications").whereIn("user_id", userIds).delete();
    await db("documents").whereIn("user_id", userIds).delete();
    await db("idempotency_keys").whereIn("user_id", userIds).delete();
    await db("sessions").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": `tq-${ulid()}` });

let phoneSeed = 73_000_000;
function uniquePhone(): string {
  phoneSeed += 1;
  return `+2547${String(phoneSeed).slice(-8)}`;
}

async function renter() {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  await db("users").where({ id: u.userId }).update({ full_name: "Brian Kiptoo", phone: uniquePhone(), phone_verified: true });
  for (const kind of ["national_id", "driving_licence"]) {
    await db("documents").insert({
      id: generateId("document"),
      merchant_id: null,
      user_id: u.userId,
      vehicle_id: null,
      kind,
      storage_key: `test/renter/${u.userId}/${kind}`,
      original_name: `${kind}.pdf`,
      size_bytes: 1024,
      content_type: "application/pdf",
      review_state: "pending",
    });
  }
  return u;
}

async function listing(opts: { truck?: boolean; hiringUnit?: string; kmRate?: number; quoteRequired?: boolean } = {}) {
  const owner = await createVerifiedTestUser();
  userIds.push(owner.userId);
  await db("users").where({ id: owner.userId }).update({ phone: uniquePhone() });
  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: owner.userId,
    owner_type: "individual",
    first_name: "Peter",
    surname: "Mwangi",
    payout_method: "mpesa",
    payout_same: true,
    onboarding_step: 5,
    onboarding_max_step: 5,
    onboarding_screen: "done",
    onboarding_submitted: true,
    approved_at: new Date(),
  });
  merchantIds.push(merchantId);
  const truck = opts.truck !== false;
  const vehicleId = generateId("vehicle");
  await db("vehicles").insert({
    id: vehicleId,
    merchant_id: merchantId,
    type: truck ? "truck" : "sedan",
    ...(truck ? { truck_type: "canter", payload_kg: 4_000 } : {}),
    make: "Isuzu",
    model: "NPR",
    year: "2019",
    registration: `KC${ulid().slice(-5).toUpperCase()}`,
    transmission: "Manual",
    fuel: "Diesel",
    seats: 3,
    county: "Nairobi",
    pickup_address: "Yard 3, Mombasa Road",
    daily_rate_amount: 1_200_000,
    daily_rate_currency: "KES",
    minimum_hire_days: 1,
    chauffeured: true,
    status: "live",
    hiring_unit: opts.hiringUnit ?? "km",
    ...(opts.kmRate !== undefined || (opts.hiringUnit ?? "km") === "km"
      ? { km_rate_amount: opts.kmRate ?? 12_000, km_rate_currency: "KES" }
      : {}),
    quote_required: opts.quoteRequired ?? false,
  });
  return { merchantId, vehicleId, ownerToken: owner.accessToken };
}

const DAY = 24 * 60 * 60 * 1000;
function dates(startInDays: number) {
  const NAIROBI_OFFSET = 3 * 60 * 60 * 1000;
  const day = new Date(Date.now() + NAIROBI_OFFSET + startInDays * DAY).toISOString().slice(0, 10);
  return {
    pickup_at: new Date(Date.parse(`${day}T09:00:00.000Z`) - NAIROBI_OFFSET).toISOString(),
    dropoff_at: new Date(Date.parse(`${day}T17:00:00.000Z`) - NAIROBI_OFFSET).toISOString(),
  };
}

const ROUTE = {
  route_from: "Godown 14, Enterprise Road",
  route_from_county: "Nairobi",
  route_to: "Site office, Kitengela",
  route_to_county: "Kajiado",
  cargo_description: "40 bags of cement",
};

async function requestTruck(hirerToken: string, vehicleId: string, extra: Record<string, unknown> = ROUTE) {
  return request(app)
    .post("/bookings")
    .set(bearer(hirerToken))
    .set(idem())
    .send({ ...dates(3), vehicle_id: vehicleId, ...extra });
}

async function quote(ownerToken: string, bookingId: string, amount = 2_500_000, note?: string) {
  return request(app)
    .post(`/merchant/bookings/${bookingId}/quote`)
    .set(bearer(ownerToken))
    .set(idem())
    .send({ amount: { amount, currency: "KES" }, ...(note ? { note } : {}) });
}

describe("a per-km truck is quoted, not priced instantly", () => {
  it("goes request -> quote -> accept -> confirmed, with the money set once by the quote", async () => {
    const hirer = await renter();
    const { merchantId, vehicleId, ownerToken } = await listing();

    const created = await requestTruck(hirer.accessToken, vehicleId);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("quote_requested");
    // Nothing to show as a price yet - the quote is null, not zero.
    expect(created.body.quote).toBeNull();
    const request_n = await db("notifications").where({ merchant_id: merchantId, subject_id: created.body.id }).first("title");
    expect(request_n.title).toBe("New quote request");

    // The owner can't just accept a quote request - it needs a price.
    const confirm = await request(app)
      .post(`/merchant/bookings/${created.body.id}/confirm`)
      .set(bearer(ownerToken))
      .set(idem());
    expect(confirm.status).toBe(409);
    expect(confirm.body.error.code).toBe("quote_required");

    const quoted = await quote(ownerToken, created.body.id, 2_500_000, "Includes fuel and tolls.");
    expect(quoted.status).toBe(200);
    expect(quoted.body.status).toBe("quoted");
    expect(quoted.body.quote.amount).toEqual({ amount: 2_500_000, currency: "KES" });
    expect(quoted.body.quote.note).toBe("Includes fuel and tolls.");
    const expected = computeBookingPricing(2_500_000, 1);
    expect(quoted.body.commission.amount).toBe(expected.commission.amount);
    expect(quoted.body.merchant_net.amount).toBe(expected.merchantNet.amount);
    const hoursValid = (Date.parse(quoted.body.quote.expires_at) - Date.now()) / (60 * 60 * 1000);
    expect(hoursValid).toBeGreaterThan(47);
    expect(hoursValid).toBeLessThanOrEqual(48);

    // A second quote on the same booking is refused - it's already answered.
    const again = await quote(ownerToken, created.body.id, 9_000_000);
    expect(again.status).toBe(409);

    const accepted = await request(app)
      .post(`/bookings/${created.body.id}/accept-quote`)
      .set(bearer(hirer.accessToken))
      .set(idem());
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe("confirmed");
    expect(accepted.body.total_due.amount).toBe(2_500_000);

    const audit = await db("audit_log")
      .where({ entity_type: "booking", entity_id: created.body.id })
      .whereIn("action", ["booking.quoted", "booking.quote_accepted"])
      .select("action");
    expect(audit.map((a) => a.action).sort()).toEqual(["booking.quote_accepted", "booking.quoted"]);
  });

  it("lets the merchant decline a quote request", async () => {
    const hirer = await renter();
    const { vehicleId, ownerToken } = await listing();
    const created = await requestTruck(hirer.accessToken, vehicleId);

    const declined = await request(app)
      .post(`/merchant/bookings/${created.body.id}/decline`)
      .set(bearer(ownerToken))
      .set(idem())
      .send({ reason_code: "not_free" });
    expect(declined.status).toBe(200);
    expect(declined.body.status).toBe("declined");
  });

  it("lets the renter say no thanks to a quote", async () => {
    const hirer = await renter();
    const { vehicleId, ownerToken } = await listing();
    const created = await requestTruck(hirer.accessToken, vehicleId);
    await quote(ownerToken, created.body.id);

    const refused = await request(app)
      .post(`/bookings/${created.body.id}/cancel`)
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ reason: "Too dear" });
    expect(refused.status).toBe(200);
    expect(refused.body.status).toBe("cancelled");
  });

  it("refuses to accept before a price is in, or after it lapses", async () => {
    const hirer = await renter();
    const { vehicleId, ownerToken } = await listing();
    const created = await requestTruck(hirer.accessToken, vehicleId);

    const early = await request(app)
      .post(`/bookings/${created.body.id}/accept-quote`)
      .set(bearer(hirer.accessToken))
      .set(idem());
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("no_quote_to_accept");

    await quote(ownerToken, created.body.id);
    await db("bookings").where({ id: created.body.id }).update({ quote_expires_at: new Date(Date.now() - 60_000) });

    const late = await request(app)
      .post(`/bookings/${created.body.id}/accept-quote`)
      .set(bearer(hirer.accessToken))
      .set(idem());
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("quote_expired");

    // The sweep lapses it on the quote's own clock.
    await expireStaleBookingRequests();
    const row = await db("bookings").where({ id: created.body.id }).first("status");
    expect(row.status).toBe("expired");
  });
});

describe("Always quote me first", () => {
  it("turns a day-priced listing's request into a quote request", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing({ truck: false, hiringUnit: "day", quoteRequired: true });

    const created = await requestTruck(hirer.accessToken, vehicleId, {});
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("quote_requested");
  });

  it("leaves an ordinary listing priced instantly", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing({ truck: false, hiringUnit: "day" });

    const created = await requestTruck(hirer.accessToken, vehicleId, {});
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("requested");
  });
});

describe("setting per-km / per-tonne prices", () => {
  it("is for trucks only, needs its own rate, and shows renters a quoted listing", async () => {
    const sedan = await listing({ truck: false, hiringUnit: "day" });
    const refused = await request(app)
      .patch(`/merchant/vehicles/${sedan.vehicleId}`)
      .set(bearer(sedan.ownerToken))
      .send({ hiring_unit: "km", km_rate: "120" });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("hiring_unit_trucks_only");

    const truck = await listing({ hiringUnit: "trip", kmRate: 0 });
    await db("vehicles").where({ id: truck.vehicleId }).update({ km_rate_amount: null, trip_rate_amount: 1_000_000 });
    const noRate = await request(app)
      .patch(`/merchant/vehicles/${truck.vehicleId}`)
      .set(bearer(truck.ownerToken))
      .send({ hiring_unit: "tonne" });
    expect(noRate.status).toBe(422);
    expect(noRate.body.error.code).toBe("tonne_rate_required");

    const ok = await request(app)
      .patch(`/merchant/vehicles/${truck.vehicleId}`)
      .set(bearer(truck.ownerToken))
      .send({ hiring_unit: "tonne", tonne_rate: "2500", minimum_charge: "5000" });
    expect(ok.status).toBe(200);
    expect(ok.body.hiring_unit).toBe("tonne");
    expect(ok.body.tonne_rate).toEqual({ amount: 250_000, currency: "KES" });
    expect(ok.body.minimum_charge).toEqual({ amount: 500_000, currency: "KES" });

    const pub = await request(app).get(`/catalog/vehicles/${truck.vehicleId}`);
    expect(pub.status).toBe(200);
    expect(pub.body.quoted).toBe(true);
    expect(pub.body.tonne_rate).toEqual({ amount: 250_000, currency: "KES" });
  });
});

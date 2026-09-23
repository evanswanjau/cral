import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";
import { computeBookingPricing } from "../../../lib/booking-pricing.js";

/**
 * A renter requesting a car. The load-bearing behaviour: the two gates
 * decide what is bookable (same predicate as the public catalog), the
 * server computes every figure, a request lands on the merchant's queue
 * as a real notification, and the renter's own pending requests do not
 * block their own dates.
 */

const app = createApp();
const userIds: string[] = [];
const merchantIds: string[] = [];

afterAll(async () => {
  if (merchantIds.length) {
    const vehicleIds = (
      await db("vehicles").whereIn("merchant_id", merchantIds).select("id")
    ).map((v) => v.id);
    if (vehicleIds.length) {
      await db("booking_events")
        .whereIn(
          "booking_id",
          db("bookings").whereIn("vehicle_id", vehicleIds).select("id"),
        )
        .delete();
      await db("bookings").whereIn("vehicle_id", vehicleIds).delete();
    }
    await db("notifications").whereIn("merchant_id", merchantIds).delete();
    await db("documents").whereIn("merchant_id", merchantIds).delete();
    await db("vehicles").whereIn("merchant_id", merchantIds).delete();
    await db("merchants").whereIn("id", merchantIds).delete();
  }
  if (userIds.length) {
    await db("documents").whereIn("user_id", userIds).delete();
    await db("bookings").whereIn("hirer_id", userIds).delete();
    await db("idempotency_keys").whereIn("user_id", userIds).delete();
    await db("sessions").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": `cb-${ulid()}` });

let phoneSeed = 71_000_000;
function uniquePhone(): string {
  phoneSeed += 1;
  return `+2547${String(phoneSeed).slice(-8)}`;
}

/**
 * A renter with both identity documents uploaded (pending review) and a
 * verified phone - both are gates on `POST /bookings`. `withPhoneVerified:
 * false` exercises the phone gate itself.
 */
async function renter(opts: { withDocuments?: boolean; withPhoneVerified?: boolean } = {}) {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  await db("users").where({ id: u.userId }).update({
    full_name: "Brian Kiptoo",
    phone: uniquePhone(),
    phone_verified: opts.withPhoneVerified !== false,
  });

  if (opts.withDocuments !== false) {
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
  }
  return u;
}

async function listing(
  opts: {
    approved?: boolean;
    status?: string;
    rate?: number;
    minDays?: number;
    hiringUnit?: "day" | "hour" | "trip";
    hourlyRate?: number;
    tripRate?: number;
  } = {},
) {
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
    ...(opts.approved === false ? {} : { approved_at: new Date() }),
  });
  merchantIds.push(merchantId);

  const vehicleId = generateId("vehicle");
  await db("vehicles").insert({
    id: vehicleId,
    merchant_id: merchantId,
    type: "sedan",
    make: "Toyota",
    model: "Corolla Fielder",
    year: "2018",
    registration: `KB${ulid().slice(-5).toUpperCase()}`,
    transmission: "Automatic",
    fuel: "Petrol",
    seats: 5,
    county: "Nairobi",
    pickup_address: "17 Ndemi Road, Kilimani",
    daily_rate_amount: opts.rate ?? 420_000,
    daily_rate_currency: "KES",
    minimum_hire_days: opts.minDays ?? 1,
    chauffeured: false,
    status: opts.status ?? "live",
    hiring_unit: opts.hiringUnit ?? "day",
    ...(opts.hourlyRate !== undefined
      ? { hourly_rate_amount: opts.hourlyRate, hourly_rate_currency: "KES" }
      : {}),
    ...(opts.tripRate !== undefined ? { trip_rate_amount: opts.tripRate, trip_rate_currency: "KES" } : {}),
  });

  return { merchantId, vehicleId, ownerUserId: owner.userId };
}

const DAY = 24 * 60 * 60 * 1000;
/**
 * `nights` is the gap between the two dates, NOT the billed days: hire
 * days are counted inclusively (owner's call, 2026-09-19), so a pair
 * `nights` apart bills as `nights + 1`. `dates(3, 0)` is a same-day hire.
 *
 * Both instants are pinned to a fixed hour of the Nairobi day (09:00
 * pickup, 17:00 dropoff) rather than offset from "now" - otherwise a
 * suite running late in the EAT evening pushes a same-day dropoff over
 * midnight and it bills as two days.
 */
function dates(startInDays: number, nights: number) {
  const NAIROBI_OFFSET = 3 * 60 * 60 * 1000;
  const day = (offsetDays: number) =>
    new Date(Date.now() + NAIROBI_OFFSET + offsetDays * DAY).toISOString().slice(0, 10);
  return {
    // 09:00 and 17:00 Nairobi, expressed as the UTC we actually store.
    pickup_at: new Date(Date.parse(`${day(startInDays)}T09:00:00.000Z`) - NAIROBI_OFFSET).toISOString(),
    dropoff_at: new Date(Date.parse(`${day(startInDays + nights)}T17:00:00.000Z`) - NAIROBI_OFFSET).toISOString(),
  };
}

describe("requesting a car", () => {
  it("creates the booking, computes the money, and notifies the merchant", async () => {
    const hirer = await renter();
    const { merchantId, vehicleId } = await listing({ rate: 420_000 });

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(3, 3), vehicle_id: vehicleId, note_from_hirer: "Landing at 6pm." });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("requested");
    expect(res.body.ref).toMatch(/^CB\d{6}\d{3}$/);
    // dates(3, 3) spans four Nairobi days inclusive.
    expect(res.body.days).toBe(4);

    // Every figure comes from the server's own pricing function.
    const expected = computeBookingPricing(420_000, 4);
    expect(res.body.gross.amount).toBe(expected.gross.amount);
    // CRAL takes no deposit for now (owner's call, 2026-09-11), so the
    // renter is asked for the hire and nothing else.
    expect(res.body.deposit.amount).toBe(0);
    expect(res.body.total_due.amount).toBe(expected.gross.amount);
    const stored = await db("bookings").where({ id: res.body.id }).first("deposit_amount");
    expect(stored.deposit_amount).toBe(0);

    // The merchant's queue got a real notification - the first generator
    // this category has ever had.
    const notification = await db("notifications")
      .where({ merchant_id: merchantId, category: "booking", subject_id: res.body.id })
      .first();
    expect(notification).toBeTruthy();
    expect(notification.ref).toBe(res.body.ref);

    const audit = await db("audit_log")
      .where({ entity_type: "booking", entity_id: res.body.id, action: "booking.requested" })
      .first();
    expect(audit).toBeTruthy();

    // The exact street address stays private until the owner accepts.
    expect(JSON.stringify(res.body)).not.toContain("Ndemi Road");
  });

  it("ignores a client-supplied price - the vehicle's own rate decides", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing({ rate: 900_000 });

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(2, 2), vehicle_id: vehicleId, gross: { amount: 1, currency: "KES" } });

    expect(res.status).toBe(201);
    expect(res.body.gross.amount).toBe(computeBookingPricing(900_000, 3).gross.amount);
  });
});

describe("hiring cadence (day/hour/trip)", () => {
  it("prices an hour-unit vehicle by hours, not days", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing({ hiringUnit: "hour", hourlyRate: 50_000 });

    // 09:00 to 17:00 same day - 8 hours, well inside one calendar day.
    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(3, 0), vehicle_id: vehicleId });

    expect(res.status).toBe(201);
    expect(res.body.rate_unit).toBe("hour");
    expect(res.body.rate_quantity).toBe(8);
    expect(res.body.gross.amount).toBe(computeBookingPricing(50_000, 8).gross.amount);

    const stored = await db("bookings").where({ id: res.body.id }).first("rate_unit", "rate_quantity");
    expect(stored.rate_unit).toBe("hour");
    expect(stored.rate_quantity).toBe(8);
  });

  it("prices a trip-unit vehicle as a flat fee regardless of duration", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing({ hiringUnit: "trip", tripRate: 1_500_000 });

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(3, 4), vehicle_id: vehicleId }); // a 5-day span - price must ignore it

    expect(res.status).toBe(201);
    expect(res.body.rate_unit).toBe("trip");
    expect(res.body.rate_quantity).toBe(1);
    expect(res.body.gross.amount).toBe(1_500_000);
  });

  it("422s an hour-unit vehicle with no hourly rate set, rather than pricing it at zero", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing({ hiringUnit: "hour" });

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(3, 0), vehicle_id: vehicleId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("vehicle_not_bookable");
  });

  it("does not apply the day-unit minimum-hire gate to an hour/trip vehicle", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing({ hiringUnit: "trip", tripRate: 2_000_000, minDays: 30 });

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(3, 0), vehicle_id: vehicleId });

    expect(res.status).toBe(201);
  });
});

describe("the two gates apply to booking, not just to search", () => {
  it("404s a paused listing and an unapproved merchant's car", async () => {
    const hirer = await renter();
    const paused = await listing({ status: "paused" });
    const unapproved = await listing({ approved: false });

    for (const v of [paused.vehicleId, unapproved.vehicleId]) {
      const res = await request(app)
        .post("/bookings")
        .set(bearer(hirer.accessToken))
        .set(idem())
        .send({ ...dates(3, 2), vehicle_id: v });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("vehicle_not_found");
    }
  });
});

describe("availability", () => {
  it("blocks dates held by a confirmed hire", async () => {
    const hirer = await renter();
    const other = await renter();
    const { vehicleId } = await listing();

    const first = await request(app)
      .post("/bookings")
      .set(bearer(other.accessToken))
      .set(idem())
      .send({ ...dates(5, 3), vehicle_id: vehicleId });
    expect(first.status).toBe(201);
    await db("bookings").where({ id: first.body.id }).update({ status: "confirmed" });

    const clash = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(6, 1), vehicle_id: vehicleId });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("dates_unavailable");
  });

  it("lets the same renter hold two pending requests over the same dates", async () => {
    // The design allows it explicitly: you only ever pay for the one you
    // confirm. A pending request must not fence off its own dates.
    const hirer = await renter();
    const a = await listing();
    const b = await listing();
    const when = dates(9, 2);

    const first = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...when, vehicle_id: a.vehicleId });
    const second = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...when, vehicle_id: b.vehicleId });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });
});

describe("request validation", () => {
  it("rejects a hire shorter than the listing's minimum", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing({ minDays: 3 });

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(4, 1), vehicle_id: vehicleId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("below_minimum_hire");
  });

  it("rejects a return that is not after the pickup", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing();
    const same = new Date(Date.now() + 3 * DAY).toISOString();

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ vehicle_id: vehicleId, pickup_at: same, dropoff_at: same });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("invalid_dates");
  });

  it("bills a same-day hire as one day, and an overnight as two", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing({ rate: 420_000, minDays: 1 });

    const sameDay = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(3, 0), vehicle_id: vehicleId });
    expect(sameDay.status).toBe(201);
    expect(sameDay.body.days).toBe(1);
    expect(sameDay.body.gross.amount).toBe(computeBookingPricing(420_000, 1).gross.amount);

    const overnight = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(20, 1), vehicle_id: vehicleId });
    expect(overnight.status).toBe(201);
    expect(overnight.body.days).toBe(2);
    expect(overnight.body.gross.amount).toBe(computeBookingPricing(420_000, 2).gross.amount);
  });

  it("refuses a pickup date that has already passed in Nairobi", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing();

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(-3, 1), vehicle_id: vehicleId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("invalid_dates");
  });

  it("requires a verified phone before the request goes out", async () => {
    const hirer = await renter({ withPhoneVerified: false });
    const { vehicleId } = await listing();

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(3, 2), vehicle_id: vehicleId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("phone_verification_required");
  });

  it("requires the renter's identity documents to be on file", async () => {
    const hirer = await renter({ withDocuments: false });
    const { vehicleId } = await listing();

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(3, 2), vehicle_id: vehicleId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("documents_required");
  });

  it("needs an Idempotency-Key", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing();

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .send({ ...dates(3, 2), vehicle_id: vehicleId });

    expect(res.status).toBe(400);
  });
});

describe("my trips", () => {
  it("lists only the caller's own bookings, with whole-set counts", async () => {
    const hirer = await renter();
    const stranger = await renter();
    const { vehicleId } = await listing();

    const mine = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(12, 2), vehicle_id: vehicleId });
    expect(mine.status).toBe(201);

    const list = await request(app).get("/bookings").set(bearer(hirer.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data.map((b: { id: string }) => b.id)).toContain(mine.body.id);
    expect(list.body.counts.upcoming).toBeGreaterThanOrEqual(1);

    const theirs = await request(app).get("/bookings").set(bearer(stranger.accessToken));
    expect(theirs.body.data.map((b: { id: string }) => b.id)).not.toContain(mine.body.id);

    // Another account's booking is a 404, not a 403.
    const peek = await request(app)
      .get(`/bookings/${mine.body.id}`)
      .set(bearer(stranger.accessToken));
    expect(peek.status).toBe(404);
  });
});

describe("cancelling", () => {
  it("withdraws a pending request", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing();

    const created = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(15, 2), vehicle_id: vehicleId });

    const cancelled = await request(app)
      .post(`/bookings/${created.body.id}/cancel`)
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ reason: "Changed plans" });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
    expect(cancelled.body.cancel_reason).toBe("Changed plans");
  });

  it("refunds a confirmed, paid booking in full when the renter cancels before pickup", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing();

    const created = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(15, 2), vehicle_id: vehicleId });

    const grossAmount = created.body.gross.amount as number;
    const paymentId = generateId("payment");
    await db("payment_requests").insert({
      id: paymentId,
      booking_id: created.body.id,
      purpose: "full",
      amount_amount: grossAmount,
      amount_currency: "KES",
      phone: "+254700000111",
      status: "success",
      provider: "console",
      provider_request_id: `test_${ulid()}`,
      expires_at: new Date(Date.now() + DAY),
    });
    await db("bookings").where({ id: created.body.id }).update({
      status: "confirmed",
      payment_request_id: paymentId,
    });

    const cancelled = await request(app)
      .post(`/bookings/${created.body.id}/cancel`)
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ reason: "Changed plans" });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");

    const refund = await db("refunds")
      .where({ booking_id: created.body.id, reason: "hirer_cancelled" })
      .first();
    expect(refund).toMatchObject({
      amount_amount: grossAmount,
      amount_currency: "KES",
      phone: "+254700000111",
      status: "success",
    });
  });

  it("does not create a refund obligation for a withdrawn (never-paid) request", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing();

    const created = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(16, 2), vehicle_id: vehicleId });

    const cancelled = await request(app)
      .post(`/bookings/${created.body.id}/cancel`)
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ reason: "Changed plans" });

    expect(cancelled.status).toBe(200);
    const refund = await db("refunds").where({ booking_id: created.body.id }).first();
    expect(refund).toBeUndefined();
  });

  it("refuses once the pickup time has passed", async () => {
    const hirer = await renter();
    const { vehicleId } = await listing();

    const created = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ ...dates(20, 2), vehicle_id: vehicleId });
    await db("bookings")
      .where({ id: created.body.id })
      .update({ status: "confirmed", pickup_at: new Date(Date.now() - DAY) });

    const res = await request(app)
      .post(`/bookings/${created.body.id}/cancel`)
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("booking_not_cancellable");
  });
});

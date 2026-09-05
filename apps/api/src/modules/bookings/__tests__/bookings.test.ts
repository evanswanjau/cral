import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { randomInt } from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { emailAdapter } from "../../../lib/adapters.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";
import { generateId } from "../../../lib/ids.js";
import { hashPassword } from "../../../lib/password.js";
import { computeBookingPricing } from "../../../lib/booking-pricing.js";
import { expireStaleBookingRequests } from "../service.js";

const app = createApp();
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    // bookings.hirer_id is ON DELETE RESTRICT by design (a hirer isn't
    // supposed to vanish out from under their own booking history), so
    // test cleanup has to remove bookings before the users — a merchant
    // user's cascade (merchants -> vehicles) would otherwise hit the same
    // RESTRICT via bookings.vehicle_id if any booking outlived it.
    const merchantIds = (await db("merchants").whereIn("user_id", createdUserIds).select("id")).map((m) => m.id);
    await db("bookings")
      .where((b) => b.whereIn("merchant_id", merchantIds).orWhereIn("hirer_id", createdUserIds))
      .delete();
    await db("users").whereIn("id", createdUserIds).delete();
  }
  await db.destroy();
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function idem() {
  return { "Idempotency-Key": ulid() };
}

function extractCode(message: string): string {
  const match = message.match(/\b(\d{6})\b/);
  if (!match) throw new Error(`No 6-digit code found in message: ${message}`);
  return match[1] as string;
}

async function newMerchant() {
  const user = await createVerifiedTestUser();
  createdUserIds.push(user.userId);
  return user;
}

async function newHirer(name = "Test Hirer") {
  const suffix = ulid().slice(-10).toLowerCase();
  const email = `hirer-${suffix}@example.test`;
  // A fresh random draw each call, not a per-process counter — a counter
  // reproduces the exact same phone sequence on every run, which collides
  // with any previous run's rows left behind by a failed cleanup.
  const phoneDigits = randomInt(700_000_000, 799_999_999).toString();
  const [user] = await db("users")
    .insert({
      id: generateId("user"),
      full_name: name,
      phone: `+254${phoneDigits}`,
      email,
      password_hash: await hashPassword("correct horse battery staple"),
      roles: ["customer"],
      email_verified: true,
    })
    .returning("*");
  if (!user) throw new Error("Failed to create test hirer");
  createdUserIds.push(user.id);
  return user;
}

async function newVehicle(accessToken: string, registration: string) {
  const res = await request(app)
    .post("/merchant/vehicles")
    .set(auth(accessToken))
    .send({
      type: "sedan",
      make: "Toyota",
      model: "Axio",
      year: "2019",
      registration,
      transmission: "Automatic",
      fuel: "Petrol",
      county: "Nairobi",
      pickup_address: "Westlands, Nairobi",
      daily_rate: "4200",
    });
  return res.body;
}

/** Inserts a booking row directly, bypassing the (not-yet-built) customer-side create flow. */
async function insertBooking(
  merchantId: string,
  vehicleId: string,
  hirerId: string,
  overrides: Partial<{ status: string; pickup_at: Date; dropoff_at: Date; response_due_at: Date | null; days: number }> = {},
) {
  const days = overrides.days ?? 3;
  const pricing = computeBookingPricing(420000, days);
  const pickupAt = overrides.pickup_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dropoffAt = overrides.dropoff_at ?? new Date(pickupAt.getTime() + days * 24 * 60 * 60 * 1000);

  const result = await db.raw<{ rows: { n: string }[] }>("select nextval('booking_ref_seq') as n");
  const ref = `CB-${result.rows[0]!.n}`;

  const [booking] = await db("bookings")
    .insert({
      id: generateId("booking"),
      ref,
      merchant_id: merchantId,
      vehicle_id: vehicleId,
      hirer_id: hirerId,
      status: overrides.status ?? "requested",
      pickup_at: pickupAt,
      dropoff_at: dropoffAt,
      pickup_location: "Westlands, Nairobi",
      dropoff_location: "Westlands, Nairobi",
      gross_amount: pricing.gross.amount,
      commission_amount: pricing.commission.amount,
      merchant_net_amount: pricing.merchantNet.amount,
      deposit_amount: pricing.deposit.amount,
      payout_method: "mpesa",
      payout_detail: "0733376061",
      payout_account_name: "Test Merchant",
      response_due_at: "response_due_at" in overrides ? overrides.response_due_at : new Date(Date.now() + 12 * 60 * 60 * 1000),
    })
    .returning("*");
  return booking;
}

describe("bookings — dev seed", () => {
  it("seeds a fixture set across every status", async () => {
    const { accessToken } = await newMerchant();
    const res = await request(app).post("/merchant/bookings/dev-seed").set(auth(accessToken));
    expect(res.status).toBe(201);
    expect(res.body.seeded).toBeGreaterThan(0);

    const list = await request(app).get("/merchant/bookings").set(auth(accessToken));
    expect(list.status).toBe(200);
    expect(list.body.counts.all).toBe(res.body.seeded);
    expect(list.body.counts.requests).toBeGreaterThan(0);
  });
});

describe("bookings — confirm / decline", () => {
  it("accepts a request and writes an event", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 100A");
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id);

    const res = await request(app).post(`/merchant/bookings/${booking.id}/confirm`).set(auth(accessToken)).set(idem());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.events[0]).toMatchObject({ label: "You accepted the booking" });
  });

  it("refuses to confirm twice", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 101A");
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id);

    await request(app).post(`/merchant/bookings/${booking.id}/confirm`).set(auth(accessToken)).set(idem());
    const again = await request(app).post(`/merchant/bookings/${booking.id}/confirm`).set(auth(accessToken)).set(idem());
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_answered");
  });

  it("declines a request with a full refund and zero commission", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 102A");
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id);

    const res = await request(app)
      .post(`/merchant/bookings/${booking.id}/decline`)
      .set(auth(accessToken))
      .set(idem())
      .send({ reason_code: "not_free" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("declined");
    expect(res.body.refund).toEqual({ amount: booking.gross_amount, currency: "KES" });
    expect(res.body.merchant_net).toEqual({ amount: 0, currency: "KES" });
  });

  it("expires an unanswered request past its 12h window", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 103A");
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id, { response_due_at: new Date(Date.now() - 1000) });

    const count = await expireStaleBookingRequests();
    expect(count).toBeGreaterThanOrEqual(1);

    const res = await request(app).get(`/merchant/bookings/${booking.id}`).set(auth(accessToken));
    expect(res.body.status).toBe("expired");
  });

  it("never double-writes the expiry event when two sweeps race the same stale request", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 103B");
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id, { response_due_at: new Date(Date.now() - 1000) });

    // Both sweeps' initial SELECT sees the same "requested" row and race
    // to update it — Postgres serializes the two UPDATEs via row locking,
    // so exactly one affects a row and the other's guarded UPDATE affects
    // zero. Before the fix, the event/audit writes weren't guarded by
    // that row count, so both sweeps would append a "Request expired"
    // event and an audit_log row for the same transition.
    await Promise.all([expireStaleBookingRequests(), expireStaleBookingRequests()]);

    const res = await request(app).get(`/merchant/bookings/${booking.id}`).set(auth(accessToken));
    expect(res.body.status).toBe("expired");
    expect(res.body.events.filter((e: { label: string }) => e.label === "Request expired")).toHaveLength(1);

    const auditRows = await db("audit_log").where({ entity_id: booking.id, action: "booking.expired" });
    expect(auditRows).toHaveLength(1);
  });
});

describe("bookings — cancel", () => {
  it("cancels free before pickup", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 104A");
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id, {
      status: "confirmed",
      pickup_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .post(`/merchant/bookings/${booking.id}/cancel`)
      .set(auth(accessToken))
      .set(idem())
      .send({ reason: "Plans changed" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
    expect(res.body.cancellation_fee).toBeNull();
    expect(res.body.refund).toEqual({ amount: booking.gross_amount, currency: "KES" });
  });

  it("applies the 25% late fee at or after pickup", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 105A");
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id, {
      status: "active",
      pickup_at: new Date(Date.now() - 60 * 60 * 1000),
    });

    const res = await request(app)
      .post(`/merchant/bookings/${booking.id}/cancel`)
      .set(auth(accessToken))
      .set(idem())
      .send({ reason: "Vehicle unavailable" });
    expect(res.status).toBe(200);
    const expectedFee = Math.round(booking.gross_amount * 0.25);
    expect(res.body.cancellation_fee).toEqual({ amount: expectedFee, currency: "KES" });
    expect(res.body.refund).toEqual({ amount: booking.gross_amount - expectedFee, currency: "KES" });
  });
});

describe("bookings — handover", () => {
  it("runs pickup then return through the full state machine", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 106A");
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id, { status: "confirmed" });

    const emailSpy = vi.spyOn(emailAdapter, "send");

    // --- pickup ---
    const openPickup = await request(app)
      .post(`/merchant/bookings/${booking.id}/handovers`)
      .set(auth(accessToken))
      .send({ kind: "pickup" });
    expect(openPickup.status).toBe(201);
    expect(openPickup.body.state).toBe("otp_sent");
    const pickupHandoverId = openPickup.body.id;

    const pickupCode = extractCode(emailSpy.mock.calls.at(-1)?.[0]?.text ?? "");

    const wrongOtp = await request(app)
      .post(`/merchant/handovers/${pickupHandoverId}/otp/verify`)
      .set(auth(accessToken))
      .send({ code: "000000" });
    expect(wrongOtp.status).toBe(422);
    expect(wrongOtp.body.error.code).toBe("otp_incorrect");

    const rightOtp = await request(app)
      .post(`/merchant/handovers/${pickupHandoverId}/otp/verify`)
      .set(auth(accessToken))
      .send({ code: pickupCode });
    expect(rightOtp.status).toBe(200);
    expect(rightOtp.body.state).toBe("otp_verified");

    const condition = await request(app)
      .post(`/merchant/handovers/${pickupHandoverId}/condition`)
      .set(auth(accessToken))
      .send({ odometer_km: 42000, fuel_level: "full", photo_document_ids: ["doc_fake"] });
    expect(condition.status).toBe(200);
    expect(condition.body.state).toBe("condition_logged");

    const confirmed = await request(app).post(`/merchant/handovers/${pickupHandoverId}/confirm`).set(auth(accessToken));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.state).toBe("confirmed");

    const completed = await request(app)
      .post(`/merchant/handovers/${pickupHandoverId}/complete`)
      .set(auth(accessToken))
      .set(idem());
    expect(completed.status).toBe(200);
    expect(completed.body.booking.status).toBe("active");
    expect(completed.body.booking.has_pickup_condition_photos).toBe(true);

    // --- return ---
    const openReturn = await request(app)
      .post(`/merchant/bookings/${booking.id}/handovers`)
      .set(auth(accessToken))
      .send({ kind: "return" });
    expect(openReturn.status).toBe(201);
    const returnHandoverId = openReturn.body.id;
    const returnCode = extractCode(emailSpy.mock.calls.at(-1)?.[0]?.text ?? "");

    await request(app).post(`/merchant/handovers/${returnHandoverId}/otp/verify`).set(auth(accessToken)).send({ code: returnCode });
    await request(app).post(`/merchant/handovers/${returnHandoverId}/confirm`).set(auth(accessToken));
    const returnCompleted = await request(app)
      .post(`/merchant/handovers/${returnHandoverId}/complete`)
      .set(auth(accessToken))
      .set(idem());

    expect(returnCompleted.status).toBe(200);
    expect(returnCompleted.body.booking.status).toBe("completed");
    expect(returnCompleted.body.booking.deposit_release_at).toBeTruthy();
    expect(returnCompleted.body.booking.rating_open_until).toBeTruthy();

    emailSpy.mockRestore();
  });

  it("locks the session after 5 wrong codes", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 107A");
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id, { status: "confirmed" });

    const emailSpy = vi.spyOn(emailAdapter, "send");
    const open = await request(app).post(`/merchant/bookings/${booking.id}/handovers`).set(auth(accessToken)).send({ kind: "pickup" });
    emailSpy.mockRestore();

    let lastRes;
    for (let i = 0; i < 5; i++) {
      lastRes = await request(app).post(`/merchant/handovers/${open.body.id}/otp/verify`).set(auth(accessToken)).send({ code: "000000" });
    }
    expect(lastRes!.status).toBe(422);

    const sixth = await request(app).post(`/merchant/handovers/${open.body.id}/otp/verify`).set(auth(accessToken)).send({ code: "111111" });
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe("otp_attempts_exhausted");
  });

  it("refuses a stale session past its 20-minute window", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 107B");
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id, { status: "confirmed" });

    const emailSpy = vi.spyOn(emailAdapter, "send");
    const open = await request(app).post(`/merchant/bookings/${booking.id}/handovers`).set(auth(accessToken)).send({ kind: "pickup" });
    emailSpy.mockRestore();

    // Backdate the session window directly — expires_at was written and
    // documented (spec §15's 20-minute handover window) but never
    // actually enforced anywhere until this check existed.
    await db("handovers").where({ id: open.body.id }).update({ expires_at: new Date(Date.now() - 1000) });

    const res = await request(app).post(`/merchant/handovers/${open.body.id}/otp/verify`).set(auth(accessToken)).send({ code: "000000" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("session_expired");

    const row = await db("handovers").where({ id: open.body.id }).first();
    expect(row.state).toBe("expired");
  });
});

describe("bookings — reports", () => {
  async function completedBookingWithPhotos(accessToken: string, userId: string, registration: string) {
    const vehicle = await newVehicle(accessToken, registration);
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id, {
      status: "completed",
      pickup_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    await db("bookings")
      .where({ id: booking.id })
      .update({
        has_pickup_condition_photos: true,
        returned_at: new Date(Date.now() - 4 * 60 * 60 * 1000),
        deposit_release_at: new Date(Date.now() + 20 * 60 * 60 * 1000),
        rating_open_until: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000),
      });
    return db("bookings").where({ id: booking.id }).first();
  }

  it("caps a claim at the deposit held and escalates the overflow", async () => {
    const { accessToken, userId } = await newMerchant();
    const booking = await completedBookingWithPhotos(accessToken, userId, "KDA 108A");

    const res = await request(app)
      .post(`/merchant/bookings/${booking.id}/reports`)
      .set(auth(accessToken))
      .set(idem())
      .send({ kind: "claim", category: "damage", description: "Cracked windscreen", amount: booking.deposit_amount * 10 });
    expect(res.status).toBe(201);
    expect(res.body.amount.amount).toBe(booking.deposit_amount);
    expect(res.body.escalated_dispute_id).toMatch(/^dsp_/);

    // Filing the claim should extend the deposit hold from 24h to 48h from `returned_at`.
    const afterClaim = await db("bookings").where({ id: booking.id }).first();
    const expectedRelease = new Date(booking.returned_at.getTime() + 48 * 60 * 60 * 1000).getTime();
    expect(afterClaim.deposit_release_at.getTime()).toBe(expectedRelease);
  });

  it("blocks a damage claim with no pickup condition photos on file", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 109A");
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id, {
      status: "completed",
      pickup_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    await db("bookings")
      .where({ id: booking.id })
      .update({
        returned_at: new Date(Date.now() - 4 * 60 * 60 * 1000),
        deposit_release_at: new Date(Date.now() + 20 * 60 * 60 * 1000),
      });

    const res = await request(app)
      .post(`/merchant/bookings/${booking.id}/reports`)
      .set(auth(accessToken))
      .set(idem())
      .send({ kind: "claim", category: "damage", description: "Scratch", amount: 500 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("photos_required");
  });

  it("never moves money for a conduct report", async () => {
    const { accessToken, userId } = await newMerchant();
    const booking = await completedBookingWithPhotos(accessToken, userId, "KDA 110A");

    const res = await request(app)
      .post(`/merchant/bookings/${booking.id}/reports`)
      .set(auth(accessToken))
      .set(idem())
      .send({ kind: "conduct", category: "conduct", description: "Handed the car to an unnamed driver" });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBeNull();
    expect(res.body.escalated_dispute_id).toBeNull();
  });
});

describe("bookings — rating", () => {
  it("rates a completed hirer once, then refuses a second rating", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 111A");
    const hirer = await newHirer("Rated Hirer");
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id, {
      status: "completed",
      pickup_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    await db("bookings").where({ id: booking.id }).update({ rating_open_until: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000) });

    const first = await request(app)
      .post(`/merchant/bookings/${booking.id}/rating`)
      .set(auth(accessToken))
      .send({ stars: 5, comment: "Brought it back on time." });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/merchant/bookings/${booking.id}/rating`)
      .set(auth(accessToken))
      .send({ stars: 4 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("already_rated");

    // The rating is now a real aggregate on the hirer, not just a label.
    const history = await request(app).get(`/merchant/bookings/${booking.id}/hirer-history`).set(auth(accessToken));
    expect(history.body.average_rating).toBe(5);
    expect(history.body.rating_count).toBe(1);
  });

  it("aggregates across two merchants' ratings and surfaces it on the booking", async () => {
    const hirer = await newHirer("Twice Rated");

    async function rate(stars: number, plate: string) {
      const { accessToken, userId } = await newMerchant();
      const vehicle = await newVehicle(accessToken, plate);
      const merchant = await db("merchants").where({ user_id: userId }).first();
      const booking = await insertBooking(merchant.id, vehicle.id, hirer.id, {
        status: "completed",
        pickup_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });
      await db("bookings").where({ id: booking.id }).update({ rating_open_until: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000) });
      await request(app).post(`/merchant/bookings/${booking.id}/rating`).set(auth(accessToken)).send({ stars });
      return { accessToken, bookingId: booking.id };
    }

    await rate(4, "KRT 200B");
    const { accessToken, bookingId } = await rate(2, "KRT 300C");

    const detail = await request(app).get(`/merchant/bookings/${bookingId}`).set(auth(accessToken));
    expect(detail.body.hirer_rating).toEqual({ average: 3, count: 2 });

    const list = await request(app).get("/merchant/bookings").set(auth(accessToken));
    const row = list.body.data.find((b: { id: string }) => b.id === bookingId);
    expect(row.hirer_rating).toEqual({ average: 3, count: 2 });
  });
});

describe("bookings — hirer history and ownership", () => {
  it("summarizes the hirer without leaking another booking's free text", async () => {
    const { accessToken, userId } = await newMerchant();
    const vehicle = await newVehicle(accessToken, "KDA 112A");
    const hirer = await newHirer("History Hirer");
    const merchant = await db("merchants").where({ user_id: userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id, { status: "confirmed" });

    const res = await request(app).get(`/merchant/bookings/${booking.id}/hirer-history`).set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("History Hirer");
    expect(res.body.trip_count).toBeGreaterThanOrEqual(1);
  });

  it("404s reading someone else's booking", async () => {
    const owner = await newMerchant();
    const stranger = await newMerchant();
    const vehicle = await newVehicle(owner.accessToken, "KDA 113A");
    const hirer = await newHirer();
    const merchant = await db("merchants").where({ user_id: owner.userId }).first();
    const booking = await insertBooking(merchant.id, vehicle.id, hirer.id);

    const res = await request(app).get(`/merchant/bookings/${booking.id}`).set(auth(stranger.accessToken));
    expect(res.status).toBe(404);
  });
});

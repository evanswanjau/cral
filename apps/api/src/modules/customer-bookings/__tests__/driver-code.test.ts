import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { smsAdapter } from "../../../lib/adapters.js";
import { createTestDriver, createVerifiedTestUser } from "../../../test/helpers.js";
import { handleCallback, initiatePayment } from "../../payments/service.js";
import { notificationDeliveryQueue } from "../../../jobs/notification-delivery.js";
import { deliverDriverJobSms, driverJobSmsBody } from "../../../jobs/driver-job-sms.js";
import type { BookingRow, HandoverRow } from "../../bookings/db-types.js";

/**
 * DR4 (docs/plans/drivers-that-work.md): the driver is texted a paid job,
 * and a booking with no car of the merchant's starts from the renter's
 * side - the driver reads out the code, the renter enters it. SMS is the
 * console adapter (pinned in vitest.config.ts); the tests read what it
 * was asked to send.
 */

const app = createApp();
const userIds: string[] = [];
const merchantIds: string[] = [];
const bookingIds: string[] = [];

let sent: Array<{ to: string; body: string }> = [];
beforeEach(() => {
  sent = [];
  vi.spyOn(smsAdapter, "send").mockImplementation(async (input) => {
    sent.push({ to: input.to, body: input.body });
    return { providerId: `test_${ulid()}` };
  });
});
afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  if (bookingIds.length) {
    await db("payment_requests").whereIn("booking_id", bookingIds).delete();
    await db("bookings").whereIn("id", bookingIds).delete();
  }
  if (merchantIds.length) {
    await db("notifications").whereIn("merchant_id", merchantIds).delete();
    await db("vehicles").whereIn("merchant_id", merchantIds).delete();
  }
  if (userIds.length) await db("users").whereIn("id", userIds).delete();
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": `dc-${ulid()}` });
const ctx = { ip: null, requestId: null };

async function renter(fullName = "Amina Hassan") {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  await db("users").where({ id: u.userId }).update({ full_name: fullName });
  for (const kind of ["national_id", "driving_licence"]) {
    await db("documents").insert({
      id: generateId("document"),
      user_id: u.userId,
      kind,
      storage_key: `test/renter/${u.userId}/${kind}`,
      original_name: `${kind}.pdf`,
      size_bytes: 1024,
      content_type: "application/pdf",
      review_state: "ok",
    });
  }
  return u;
}

async function merchant(withCar: boolean) {
  const owner = await createVerifiedTestUser();
  userIds.push(owner.userId);
  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: owner.userId,
    owner_type: "individual",
    first_name: "Grace",
    surname: "Wanjiru",
    payout_method: "mpesa",
    payout_same: true,
    onboarding_step: 5,
    onboarding_max_step: 5,
    onboarding_screen: "done",
    onboarding_submitted: true,
    approved_at: new Date(),
  });
  merchantIds.push(merchantId);
  let vehicleId: string | null = null;
  if (withCar) {
    vehicleId = generateId("vehicle");
    await db("vehicles").insert({
      id: vehicleId,
      merchant_id: merchantId,
      type: "suv",
      make: "Toyota",
      model: "Prado",
      year: "2020",
      registration: `KD${ulid().slice(-5).toUpperCase()}`,
      transmission: "Automatic",
      fuel: "Diesel",
      seats: 7,
      county: "Nairobi",
      daily_rate_amount: 900_000,
      daily_rate_currency: "KES",
      minimum_hire_days: 1,
      chauffeured: false,
      status: "live",
    });
  }
  return { merchantId, vehicleId };
}

const DRIVER_PHONE = "+447700900901"; // the fiction range DR3 uses

async function confirmedBooking(opts: { withCar: boolean }) {
  const hirer = await renter();
  const { merchantId, vehicleId } = await merchant(opts.withCar);
  const driverId = await createTestDriver(merchantId, { full_name: "Peter Kamau", phone: DRIVER_PHONE });
  const id = generateId("booking");
  const [row] = await db<BookingRow>("bookings")
    .insert({
      id,
      ref: `CB-TEST-${id.slice(-6)}`,
      merchant_id: merchantId,
      vehicle_id: vehicleId,
      driver_id: driverId,
      hire_car_details: opts.withCar ? null : "Mazda Demio, white",
      hirer_id: hirer.userId,
      status: "confirmed",
      pickup_at: new Date(Date.now() + 2 * 86_400_000),
      dropoff_at: new Date(Date.now() + 3 * 86_400_000),
      pickup_location: "Sarit Centre, Westlands",
      dropoff_location: "Sarit Centre, Westlands",
      gross_amount: 300_000,
      gross_currency: "KES",
      commission_amount: 30_000,
      commission_currency: "KES",
      merchant_net_amount: 270_000,
      merchant_net_currency: "KES",
      deposit_amount: 45_000,
      deposit_currency: "KES",
      payout_method: "mpesa",
      payout_detail: "0700000000",
      payout_account_name: "Test Merchant",
      has_pickup_condition_photos: false,
      deposit_released: false,
    })
    .returning("*");
  if (!row) throw new Error("failed to insert test booking");
  bookingIds.push(row.id);
  return { booking: row, hirer };
}

/** Pays the booking on the console rail, the way the callback would. */
async function pay(booking: BookingRow) {
  const { payment_request_id } = await initiatePayment(booking.hirer_id, booking.id, { purpose: "full", phone: "+254712345678" }, ctx);
  const pending = await db("payment_requests").where({ id: payment_request_id }).first();
  await handleCallback({ reference: pending.provider_request_id, succeeded: true, receipt: `R${ulid().slice(-8)}`, amountShillings: null }, ctx);
}

/** The code from the driver's SMS - the only place it exists in plain text. */
function codeFrom(body: string): string {
  const match = body.match(/this code: (\d{4})\./);
  if (!match) throw new Error(`no code in: ${body}`);
  return match[1]!;
}

describe("the driver's job SMS (DR4)", () => {
  it("queues the driver's SMS when a booking with a driver is paid", async () => {
    const add = vi.spyOn(notificationDeliveryQueue, "addBulk");
    const { booking } = await confirmedBooking({ withCar: false });
    await pay(booking);
    const jobs = add.mock.calls.flatMap(([batch]) => batch);
    const job = jobs.find((j) => j.name === "text-driver-job");
    // Only the booking id goes to Redis - never the code.
    expect(job?.data).toEqual({ bookingId: booking.id });
  });

  it("texts a driver-only job with the code, in plain words and no money", async () => {
    const { booking } = await confirmedBooking({ withCar: false });
    await pay(booking);
    await deliverDriverJobSms(booking.id);

    expect(sent).toHaveLength(1);
    const { to, body } = sent[0]!;
    expect(to).toBe(DRIVER_PHONE);
    expect(body).toContain(booking.ref);
    expect(body).toContain("Pickup: Sarit Centre, Westlands.");
    expect(body).toContain("Renter: Amina.");
    expect(body).not.toContain("Hassan");
    expect(body).toContain("Car: Mazda Demio, white.");
    expect(body).toMatch(/read Amina this code: \d{4}\./);
    expect(body).not.toMatch(/KES|commission|deposit|%/i);

    const handover = await db<HandoverRow>("handovers").where({ booking_id: booking.id }).first();
    expect(handover).toMatchObject({ kind: "pickup", code_holder: "driver", state: "otp_sent", masked_destination: null });
    const row = await db<BookingRow>("bookings").where({ id: booking.id }).first();
    expect(row?.driver_sms_sent_at).not.toBeNull();
    const event = await db("booking_events").where({ booking_id: booking.id, kind: "driver_texted" }).first();
    expect(event?.label).toBe("Job texted to Peter");

    // A redelivered job texts nothing more.
    await deliverDriverJobSms(booking.id);
    expect(sent).toHaveLength(1);
  });

  it("texts a car + driver job without a code - the owner runs that handover", async () => {
    const { booking } = await confirmedBooking({ withCar: true });
    await pay(booking);
    await deliverDriverJobSms(booking.id);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toContain("Car: Toyota Prado");
    expect(sent[0]!.body).not.toMatch(/code/i);
    expect(await db("handovers").where({ booking_id: booking.id })).toHaveLength(0);
  });

  it("texts nothing for an unpaid booking", async () => {
    const { booking } = await confirmedBooking({ withCar: false });
    await deliverDriverJobSms(booking.id);
    expect(sent).toHaveLength(0);
  });

  it("names the other owner's car on the driver half of a linked booking", async () => {
    const car = await confirmedBooking({ withCar: true });
    const { merchantId } = await merchant(false);
    const driverId = await createTestDriver(merchantId, { phone: DRIVER_PHONE });
    const id = generateId("booking");
    const [half] = await db<BookingRow>("bookings")
      .insert({
        ...car.booking,
        id,
        ref: `CB-TEST-${id.slice(-6)}`,
        merchant_id: merchantId,
        vehicle_id: null,
        driver_id: driverId,
        linked_booking_id: car.booking.id,
        payment_request_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");
    bookingIds.push(id);
    await pay(half!);
    await deliverDriverJobSms(id);
    const vehicle = await db("vehicles").where({ id: car.booking.vehicle_id }).first();
    expect(sent[0]!.body).toContain(`Car: Toyota Prado ${vehicle.registration}.`);
    expect(sent[0]!.body).toMatch(/this code: \d{4}/);
  });

  it("keeps the message short", () => {
    const body = driverJobSmsBody({
      booking: { ref: "CB-261127-001", pickup_at: new Date("2026-11-28T06:00:00Z"), dropoff_at: new Date("2026-11-28T10:00:00Z"), pickup_location: "x".repeat(200) },
      renter: "Amina",
      car: "y".repeat(200),
      code: "1234",
    });
    // Nairobi time, not UTC.
    expect(body).toContain("Sat 28 Nov, 09:00 to Sat 28 Nov, 13:00.");
    expect(body.length).toBeLessThanOrEqual(320);
  });
});

describe("POST /bookings/:id/driver-code (DR4)", () => {
  it("starts a driver-only job when the renter enters the driver's code", async () => {
    const { booking, hirer } = await confirmedBooking({ withCar: false });
    await pay(booking);
    await deliverDriverJobSms(booking.id);
    const code = codeFrom(sent[0]!.body);

    const before = await request(app).get(`/bookings/${booking.id}`).set(bearer(hirer.accessToken));
    expect(before.body.handovers[0]).toMatchObject({ kind: "pickup", code_holder: "driver", state: "otp_sent" });

    const wrong = await request(app)
      .post(`/bookings/${booking.id}/driver-code`)
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ code: code === "0000" ? "1111" : "0000" });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe("otp_incorrect");

    const noKey = await request(app).post(`/bookings/${booking.id}/driver-code`).set(bearer(hirer.accessToken)).send({ code });
    expect(noKey.status).toBe(400);

    const right = await request(app)
      .post(`/bookings/${booking.id}/driver-code`)
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ code });
    expect(right.status).toBe(200);
    expect(right.body.status).toBe("active");
    expect(right.body.handovers[0]).toMatchObject({ kind: "pickup", code_holder: "driver", state: "completed" });

    const audit = await db("audit_log").where({ entity_id: booking.id, action: "booking.activated" }).first();
    expect(audit?.actor_id).toBe(hirer.userId);
    const note = await db("notifications").where({ merchant_id: booking.merchant_id, ref: booking.ref }).first();
    expect(note?.title).toBe(`${booking.ref} · job started`);

    const again = await request(app)
      .post(`/bookings/${booking.id}/driver-code`)
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ code });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("booking_not_confirmed");
  });

  it("spends the code after five wrong tries", async () => {
    const { booking, hirer } = await confirmedBooking({ withCar: false });
    await pay(booking);
    await deliverDriverJobSms(booking.id);
    const code = codeFrom(sent[0]!.body);
    const wrongCode = code === "0000" ? "1111" : "0000";

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post(`/bookings/${booking.id}/driver-code`)
        .set(bearer(hirer.accessToken))
        .set(idem())
        .send({ code: wrongCode });
      expect(res.body.error.code).toBe("otp_incorrect");
    }
    const locked = await request(app)
      .post(`/bookings/${booking.id}/driver-code`)
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ code });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("otp_attempts_exhausted");
    const row = await db<BookingRow>("bookings").where({ id: booking.id }).first();
    expect(row?.status).toBe("confirmed");
  });

  it("refuses a booking with a car of the merchant's, and one with no code yet", async () => {
    const withCar = await confirmedBooking({ withCar: true });
    const carRes = await request(app)
      .post(`/bookings/${withCar.booking.id}/driver-code`)
      .set(bearer(withCar.hirer.accessToken))
      .set(idem())
      .send({ code: "1234" });
    expect(carRes.status).toBe(409);
    expect(carRes.body.error.code).toBe("driver_code_not_used");

    const unpaid = await confirmedBooking({ withCar: false });
    const unpaidRes = await request(app)
      .post(`/bookings/${unpaid.booking.id}/driver-code`)
      .set(bearer(unpaid.hirer.accessToken))
      .set(idem())
      .send({ code: "1234" });
    expect(unpaidRes.status).toBe(409);
    expect(unpaidRes.body.error.code).toBe("driver_code_not_sent");
  });

  it("is someone else's booking: 404", async () => {
    const { booking } = await confirmedBooking({ withCar: false });
    const stranger = await renter();
    const res = await request(app)
      .post(`/bookings/${booking.id}/driver-code`)
      .set(bearer(stranger.accessToken))
      .set(idem())
      .send({ code: "1234" });
    expect(res.status).toBe(404);
  });
});

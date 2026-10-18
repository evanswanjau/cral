import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createTestDriver, createVerifiedTestUser } from "../../../test/helpers.js";
import { computeBookingPricing } from "../../../lib/booking-pricing.js";

/**
 * Hiring a driver (docs/plans/drivers.md): with one of the merchant's own
 * cars, or alone for the renter's own car. Every figure is the server's,
 * one leg per thing hired; a driver can't be on two jobs at once; and a
 * driver only ever comes with their own merchant's cars.
 */

const app = createApp();
const userIds: string[] = [];

afterAll(async () => {
  if (userIds.length) await db("users").whereIn("id", userIds).delete();
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": `db-${ulid()}` });
let phoneSeed = 72_000_000 + Math.floor(Math.random() * 900_000);
const uniquePhone = () => `+2547${String(++phoneSeed).slice(-8)}`;

async function renter(kinds: string[] = ["national_id", "driving_licence"]) {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  await db("users").where({ id: u.userId }).update({ full_name: "Amina Hassan", phone: uniquePhone(), phone_verified: true });
  for (const kind of kinds) {
    await db("documents").insert({
      id: generateId("document"),
      user_id: u.userId,
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

async function merchant(withCar = true) {
  const owner = await createVerifiedTestUser();
  userIds.push(owner.userId);
  await db("users").where({ id: owner.userId }).update({ phone: uniquePhone() });
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
  return { merchantId, vehicleId, ownerToken: owner.accessToken };
}

const DAY = 24 * 60 * 60 * 1000;
const NAIROBI = 3 * 60 * 60 * 1000;
function at(dayOffset: number, hour: number): string {
  const day = new Date(Date.now() + NAIROBI + dayOffset * DAY).toISOString().slice(0, 10);
  return new Date(Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00.000Z`) - NAIROBI).toISOString();
}

describe("hiring a driver", () => {
  it("prices a car + driver booking as two legs, with one payee", async () => {
    const hirer = await renter();
    const { merchantId, vehicleId } = await merchant();
    const driverId = await createTestDriver(merchantId, { daily_rate_amount: 300_000 });

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ vehicle_id: vehicleId, driver_id: driverId, pickup_at: at(3, 9), dropoff_at: at(4, 17) });
    expect(res.status).toBe(201);

    const car = computeBookingPricing(900_000, 2);
    const drv = computeBookingPricing(300_000, 2);
    expect(res.body.gross.amount).toBe(car.gross.amount + drv.gross.amount);
    expect(res.body.driver_amount.amount).toBe(drv.gross.amount);
    expect(res.body.driver.display_name).toBe("Test D.");
    expect(res.body.vehicle.id).toBe(vehicleId);

    const row = await db("bookings").where({ id: res.body.id }).first();
    expect(row.merchant_id).toBe(merchantId);
    expect(row.commission_amount).toBe(car.commission.amount + drv.commission.amount);
  });

  it("books a driver alone for the renter's own car, by the hour, without the renter's licence", async () => {
    const hirer = await renter(["national_id"]);
    const { merchantId } = await merchant(false);
    const driverId = await createTestDriver(merchantId, { daily_rate_amount: null, hourly_rate_amount: 50_000 });

    const missingCar = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ driver_id: driverId, pickup_at: at(3, 9), dropoff_at: at(3, 13) });
    expect(missingCar.status).toBe(422);
    expect(missingCar.body.error.code).toBe("hire_car_details_required");

    const res = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ driver_id: driverId, driver_unit: "hour", hire_car_details: "White Mazda Demio KDA 123A", pickup_at: at(3, 9), dropoff_at: at(3, 13) });
    expect(res.status).toBe(201);
    expect(res.body.vehicle).toBeNull();
    expect(res.body.rate_unit).toBe("hour");
    expect(res.body.rate_quantity).toBe(4);
    expect(res.body.gross.amount).toBe(computeBookingPricing(50_000, 4).gross.amount);
    expect(res.body.hire_car_details).toBe("White Mazda Demio KDA 123A");

    // The merchant sees it in their own Bookings, with no car.
    const owner = await db("merchants").where({ id: merchantId }).first("user_id");
    const list = await db("bookings").where({ merchant_id: merchantId });
    expect(list).toHaveLength(1);
    expect(owner).toBeTruthy();
  });

  it("refuses a rate the driver doesn't offer, and another merchant's driver on this car", async () => {
    const hirer = await renter();
    const a = await merchant();
    const b = await merchant();
    const driverId = await createTestDriver(b.merchantId);

    const wrongCar = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ vehicle_id: a.vehicleId, driver_id: driverId, pickup_at: at(3, 9), dropoff_at: at(4, 17) });
    expect(wrongCar.status).toBe(422);
    expect(wrongCar.body.error.code).toBe("driver_not_for_this_car");

    const noTrip = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ driver_id: driverId, driver_unit: "trip", hire_car_details: "My car", pickup_at: at(3, 9), dropoff_at: at(3, 17) });
    expect(noTrip.status).toBe(422);
    expect(noTrip.body.error.code).toBe("driver_rate_unavailable");
  });

  it("won't double-book a driver, and hides one who isn't bookable", async () => {
    const hirer = await renter();
    const { merchantId } = await merchant(false);
    const driverId = await createTestDriver(merchantId);
    const first = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ driver_id: driverId, hire_car_details: "My car", pickup_at: at(5, 9), dropoff_at: at(6, 17) });
    await db("bookings").where({ id: first.body.id }).update({ status: "confirmed" });

    const clash = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ driver_id: driverId, hire_car_details: "My car", pickup_at: at(6, 9), dropoff_at: at(7, 17) });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("driver_unavailable");

    const expired = await createTestDriver(merchantId, { licence_expiry: "2020-01-01" });
    const paused = await createTestDriver(merchantId, { status: "paused" });
    const list = await request(app).get("/catalog/drivers?limit=100");
    const ids = list.body.data.map((d: { id: string }) => d.id);
    expect(ids).toContain(driverId);
    expect(ids).not.toContain(expired);
    expect(ids).not.toContain(paused);
    expect(list.body.data.find((d: { id: string }) => d.id === driverId)).not.toHaveProperty("national_id");
  });

  it("shows the merchant a driver-only booking with no car", async () => {
    const hirer = await renter();
    const { merchantId, ownerToken } = await merchant(false);
    const driverId = await createTestDriver(merchantId);
    const created = await request(app)
      .post("/bookings")
      .set(bearer(hirer.accessToken))
      .set(idem())
      .send({ driver_id: driverId, hire_car_details: "Silver Probox", pickup_at: at(3, 9), dropoff_at: at(3, 17) });
    expect(created.status).toBe(201);

    const res = await request(app).get(`/merchant/bookings/${created.body.id}`).set(bearer(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.vehicle_registration).toBeNull();
    expect(res.body.driver.full_name).toBe("Test Driver");
    expect(res.body.hire_car_details).toBe("Silver Probox");

    const list = await request(app).get("/merchant/bookings").set(bearer(ownerToken));
    expect(list.body.data[0].subject_label).toMatch(/^Driver Test Driver/);
  });
});

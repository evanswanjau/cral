import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { randomInt } from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";
import { generateId } from "../../../lib/ids.js";
import { hashPassword } from "../../../lib/password.js";
import { computeBookingPricing } from "../../../lib/booking-pricing.js";
import { getOrCreateMerchant } from "../../merchant/service.js";
import { cutPayoutRun } from "../../payouts/service.js";

const app = createApp();
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    const merchantIds = (await db("merchants").whereIn("user_id", createdUserIds).select("id")).map((m) => m.id);
    const runIds = (await db("payout_runs").whereIn("merchant_id", merchantIds).select("id")).map((r) => r.id);
    if (runIds.length > 0) {
      await db("payout_run_lines").whereIn("payout_run_id", runIds).delete();
      await db("payout_runs").whereIn("id", runIds).delete();
    }
    await db("notifications").whereIn("merchant_id", merchantIds).delete();
    await db("bookings")
      .where((b) => b.whereIn("merchant_id", merchantIds).orWhereIn("hirer_id", createdUserIds))
      .delete();
    await db("documents").whereIn("merchant_id", merchantIds).delete();
    await db("vehicles").whereIn("merchant_id", merchantIds).delete();
    await db("users").whereIn("id", createdUserIds).delete();
  }
  await db.destroy();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function newMerchant() {
  const user = await createVerifiedTestUser();
  createdUserIds.push(user.userId);
  const merchant = await getOrCreateMerchant(user.userId);
  return { ...user, merchantId: merchant.id };
}

async function newHirer(name = "Test Hirer") {
  const suffix = ulid().slice(-10).toLowerCase();
  const [user] = await db("users")
    .insert({
      id: generateId("user"),
      full_name: name,
      phone: `+254${randomInt(700_000_000, 799_999_999)}`,
      email: `hirer-${suffix}@example.test`,
      password_hash: await hashPassword("correct horse battery staple"),
      roles: ["customer"],
      email_verified: true,
    })
    .returning("*");
  if (!user) throw new Error("Failed to create test hirer");
  createdUserIds.push(user.id);
  return user;
}

async function newVehicle(merchantId: string, overrides: Record<string, unknown> = {}) {
  const [vehicle] = await db("vehicles")
    .insert({
      id: generateId("vehicle"),
      merchant_id: merchantId,
      type: "sedan",
      make: "Toyota",
      model: "Axio",
      year: "2019",
      registration: `KDA ${randomInt(100, 999)}${String.fromCharCode(65 + randomInt(0, 25))}`,
      transmission: "Automatic",
      fuel: "Petrol",
      county: "Nairobi",
      pickup_address: "Westlands, Nairobi",
      daily_rate_amount: 420000,
      status: "live",
      ...overrides,
    })
    .returning("*");
  if (!vehicle) throw new Error("Failed to create test vehicle");
  return vehicle;
}

async function newBooking(
  merchantId: string,
  vehicleId: string,
  hirerId: string,
  fields: { pickupAt: Date; dropoffAt: Date; status?: string; days?: number } & Record<string, unknown>,
) {
  const days = fields.days ?? Math.max(1, Math.round((fields.dropoffAt.getTime() - fields.pickupAt.getTime()) / DAY_MS));
  const pricing = computeBookingPricing(420000, days);
  const result = await db.raw<{ rows: { n: string }[] }>("select nextval('booking_ref_seq') as n");
  const rest = { ...fields } as Record<string, unknown>;
  delete rest.pickupAt;
  delete rest.dropoffAt;
  delete rest.status;
  delete rest.days;
  const { pickupAt, dropoffAt, status } = fields;

  const [booking] = await db("bookings")
    .insert({
      id: generateId("booking"),
      ref: `CB-${result.rows[0]!.n}`,
      merchant_id: merchantId,
      vehicle_id: vehicleId,
      hirer_id: hirerId,
      status: status ?? "completed",
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
      ...rest,
    })
    .returning("*");
  if (!booking) throw new Error("Failed to create test booking");
  return booking;
}

/** A completed booking whose deposit hold has lapsed — i.e. payable. */
async function payableBooking(merchantId: string, vehicleId: string, hirerId: string, days = 3) {
  const dropoffAt = new Date(Date.now() - 5 * DAY_MS);
  return newBooking(merchantId, vehicleId, hirerId, {
    pickupAt: new Date(dropoffAt.getTime() - days * DAY_MS),
    dropoffAt,
    status: "completed",
    days,
    returned_at: dropoffAt,
    deposit_release_at: new Date(dropoffAt.getTime() + DAY_MS),
    deposit_released: true,
  });
}

/** Monday 00:00 Nairobi of the week `now` falls in, as a UTC instant. */
function nairobiWeekStart(now = new Date()): Date {
  const shifted = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  const dow = (shifted.getUTCDay() + 6) % 7;
  const monday = new Date(shifted.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
  return new Date(Date.parse(`${monday}T00:00:00.000Z`) - NAIROBI_OFFSET_MS);
}

describe("merchant dashboard", () => {
  it("renders for a brand-new account with nothing on it", async () => {
    const merchant = await newMerchant();

    const res = await request(app).get("/merchant/dashboard").set(auth(merchant.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.fleet).toEqual({ vehicle_count: 0, outstanding_document_count: 0, vehicles: [] });
    expect(res.body.week_bookings.bookings).toEqual([]);
    expect(res.body.activity).toEqual([]);
    expect(res.body.needs_action.vehicle_count).toBe(0);
    expect(res.body.expiring).toBeNull();
    // Zeroes, not nulls standing in for numbers.
    expect(res.body.tiles.awaiting_payout.amount).toEqual({ amount: 0, currency: "KES" });
    expect(res.body.tiles.paid_this_month.amount).toEqual({ amount: 0, currency: "KES" });
    expect(res.body.next_payout.net).toEqual({ amount: 0, currency: "KES" });
    expect(res.body.tiles.awaiting_payout.date).toBeNull();
    // The chart is always six contiguous months, even with no history.
    expect(res.body.earnings.series).toHaveLength(6);
    expect(res.body.earnings.months_with_data).toBe(0);
    expect(res.body.earnings.series.at(-1).current).toBe(true);
  });

  it("agrees with GET /merchant/payouts about what is awaiting payout", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer();
    await payableBooking(merchant.merchantId, vehicle.id, hirer.id, 3);
    await payableBooking(merchant.merchantId, vehicle.id, hirer.id, 2);

    const [dashboard, payouts] = await Promise.all([
      request(app).get("/merchant/dashboard").set(auth(merchant.accessToken)),
      request(app).get("/merchant/payouts").set(auth(merchant.accessToken)),
    ]);

    const tile = payouts.body.summary.tiles.find((t: { key: string }) => t.key === "next_payout");
    // If these ever differ, one of the two has forked the payout rules.
    expect(dashboard.body.tiles.awaiting_payout.amount).toEqual(tile.amount);
    expect(dashboard.body.tiles.awaiting_payout.date).toBe(payouts.body.summary.next_run_date);
  });

  it("projects the next payout from line snapshots, with commission as their difference", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer("Samuel Mutiso");
    const a = await payableBooking(merchant.merchantId, vehicle.id, hirer.id, 3);
    const b = await payableBooking(merchant.merchantId, vehicle.id, hirer.id, 2);

    const res = await request(app).get("/merchant/dashboard").set(auth(merchant.accessToken));

    expect(res.body.next_payout.lines).toHaveLength(2);
    expect(res.body.next_payout.gross.amount).toBe(a.gross_amount + b.gross_amount);
    expect(res.body.next_payout.net.amount).toBe(a.merchant_net_amount + b.merchant_net_amount);
    expect(res.body.next_payout.commission.amount).toBe(
      res.body.next_payout.gross.amount - res.body.next_payout.net.amount,
    );
    expect(res.body.next_payout.lines[0].hirer_name).toBe("Samuel Mutiso");
    expect(res.body.next_payout.lines[0].vehicle_registration).toBe(vehicle.registration);
  });

  it("adds up to its own tile once a run has been cut", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer();
    await payableBooking(merchant.merchantId, vehicle.id, hirer.id, 3);
    await payableBooking(merchant.merchantId, vehicle.id, hirer.id, 2);
    // Cutting a run moves both bookings off `payable` and onto run lines.
    const run = await db.transaction((trx) =>
      cutPayoutRun(trx, merchant.merchantId, { method: "mpesa", detail: "+254733376061", accountName: "Test" }),
    );
    expect(run).not.toBeNull();

    const res = await request(app).get("/merchant/dashboard").set(auth(merchant.accessToken));

    // The card listed nothing while the tile above it read the run's total,
    // because a cut run's lines are not `payable` bookings any more. The two
    // must agree - they are the same money, one summed and one itemised.
    expect(res.body.next_payout.lines).toHaveLength(2);
    expect(res.body.next_payout.net.amount).toBe(res.body.tiles.awaiting_payout.amount.amount);
    expect(res.body.next_payout.net.amount).toBe(run!.net_amount);
    expect(res.body.next_payout.commission.amount).toBe(
      res.body.next_payout.gross.amount - res.body.next_payout.net.amount,
    );
  });

  it("separates money that is clearing from money that is payable", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer();
    const dropoffAt = new Date(Date.now() - DAY_MS);
    await newBooking(merchant.merchantId, vehicle.id, hirer.id, {
      pickupAt: new Date(dropoffAt.getTime() - 2 * DAY_MS),
      dropoffAt,
      status: "completed",
      returned_at: dropoffAt,
      deposit_release_at: new Date(dropoffAt.getTime() + DAY_MS),
      deposit_released: false,
    });

    const res = await request(app).get("/merchant/dashboard").set(auth(merchant.accessToken));

    expect(res.body.next_payout.lines).toHaveLength(0);
    expect(res.body.next_payout.clearing).toHaveLength(1);
    expect(res.body.tiles.awaiting_payout.amount.amount).toBe(0);
  });

  it("counts the week by overlap, not containment, and excludes the week before", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer();
    const weekStart = nairobiWeekStart();

    // Straddles the boundary: started three days before the week, still running.
    const straddling = await newBooking(merchant.merchantId, vehicle.id, hirer.id, {
      pickupAt: new Date(weekStart.getTime() - 3 * DAY_MS),
      dropoffAt: new Date(weekStart.getTime() + 2 * DAY_MS),
      status: "active",
    });
    // Ends the day before the week starts — must not appear.
    await newBooking(merchant.merchantId, vehicle.id, hirer.id, {
      pickupAt: new Date(weekStart.getTime() - 4 * DAY_MS),
      dropoffAt: new Date(weekStart.getTime() - DAY_MS),
      status: "completed",
    });

    const res = await request(app).get("/merchant/dashboard").set(auth(merchant.accessToken));

    expect(res.body.week_bookings.booking_count).toBe(1);
    expect(res.body.week_bookings.bookings[0].id).toBe(straddling.id);
    // Five hire days in total, but only the two that fall inside this week.
    expect(res.body.week_bookings.bookings[0].hire_days).toBe(5);
    expect(res.body.week_bookings.hire_days).toBe(2);
    expect(res.body.tiles.on_hire.count).toBe(1);
  });

  it("reports whole-set fleet counts while listing only the first four vehicles", async () => {
    const merchant = await newMerchant();
    for (let i = 0; i < 5; i++) await newVehicle(merchant.merchantId);

    const res = await request(app).get("/merchant/dashboard").set(auth(merchant.accessToken));

    expect(res.body.fleet.vehicle_count).toBe(5);
    expect(res.body.fleet.vehicles).toHaveLength(4);
    // Three required documents per vehicle, none uploaded.
    expect(res.body.fleet.outstanding_document_count).toBe(15);
    expect(res.body.fleet.vehicles[0].documents.map((d: { kind: string }) => d.kind)).toEqual([
      "logbook",
      "comprehensive_insurance",
      "tracker_certificate",
    ]);
    expect(res.body.fleet.vehicles[0].documents.every((d: { state: string }) => d.state === "missing")).toBe(true);
  });

  it("surfaces vehicles that need the merchant, capped at two, with the whole-set count", async () => {
    const merchant = await newMerchant();
    await newVehicle(merchant.merchantId, { status: "action", reviewer_note: "Logbook name does not match." });
    await newVehicle(merchant.merchantId, { status: "rejected", reviewer_note: "Third-party cover only." });
    await newVehicle(merchant.merchantId, { status: "action", reviewer_note: "Tracker certificate expired." });
    await newVehicle(merchant.merchantId, { status: "live" });

    const res = await request(app).get("/merchant/dashboard").set(auth(merchant.accessToken));

    expect(res.body.needs_action.vehicle_count).toBe(3);
    expect(res.body.needs_action.vehicles).toHaveLength(2);
    expect(res.body.needs_action.vehicles[0].reviewer_note).toBeTruthy();
  });

  it("shows the soonest expiring document and ignores one outside the horizon", async () => {
    const merchant = await newMerchant();
    const soon = new Date(Date.now() + 19 * DAY_MS).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 200 * DAY_MS).toISOString().slice(0, 10);
    const expiring = await newVehicle(merchant.merchantId, { insurance_expiry: soon });
    await newVehicle(merchant.merchantId, { insurance_expiry: later });

    const res = await request(app).get("/merchant/dashboard").set(auth(merchant.accessToken));

    expect(res.body.expiring).toMatchObject({
      vehicle_id: expiring.id,
      registration: expiring.registration,
      kind: "comprehensive_insurance",
      expires_on: soon,
    });
  });

  it("never reports another merchant's account as approved, or leaks their data", async () => {
    const mine = await newMerchant();
    const theirs = await newMerchant();
    await newVehicle(theirs.merchantId);
    const hirer = await newHirer();
    await payableBooking(theirs.merchantId, (await newVehicle(theirs.merchantId)).id, hirer.id);
    await db("merchants").where({ id: theirs.merchantId }).update({ approved_at: new Date() });

    const res = await request(app).get("/merchant/dashboard").set(auth(mine.accessToken));

    expect(res.body.fleet.vehicle_count).toBe(0);
    expect(res.body.next_payout.lines).toHaveLength(0);
    expect(res.body.tiles.awaiting_payout.amount.amount).toBe(0);
    // Nothing sets `approved_at` in Phase 1, so a merchant of our own is
    // never approved — and certainly not because someone else is.
    expect(res.body.merchant_status.approved).toBe(false);
    expect(res.body.merchant_status.approved_at).toBeNull();
  });

  it("requires a signed-in merchant", async () => {
    const res = await request(app).get("/merchant/dashboard");
    expect(res.status).toBe(401);
  });
});

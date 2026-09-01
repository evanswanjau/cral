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
import { cutPayoutRun } from "../service.js";

const app = createApp();
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    const merchantIds = (await db("merchants").whereIn("user_id", createdUserIds).select("id")).map((m) => m.id);
    // payout_run_lines.booking_id is ON DELETE RESTRICT (a booking must not
    // vanish from under a line that says it was paid), so lines come out
    // before bookings, and runs before merchants.
    const runIds = (await db("payout_runs").whereIn("merchant_id", merchantIds).select("id")).map((r) => r.id);
    if (runIds.length > 0) {
      await db("payout_queries").whereIn("payout_run_id", runIds).delete();
      await db("payout_run_lines").whereIn("payout_run_id", runIds).delete();
      await db("payout_runs").whereIn("id", runIds).delete();
    }
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

async function newMerchant() {
  const user = await createVerifiedTestUser();
  createdUserIds.push(user.userId);
  const merchant = await getOrCreateMerchant(user.userId);
  return { ...user, merchantId: merchant.id };
}

async function newHirer(name = "Test Hirer") {
  const suffix = ulid().slice(-10).toLowerCase();
  const phoneDigits = randomInt(700_000_000, 799_999_999).toString();
  const [user] = await db("users")
    .insert({
      id: generateId("user"),
      full_name: name,
      phone: `+254${phoneDigits}`,
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

async function newVehicle(merchantId: string) {
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
    })
    .returning("*");
  if (!vehicle) throw new Error("Failed to create test vehicle");
  return vehicle;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A completed booking whose deposit hold has lapsed — i.e. payable. */
async function payableBooking(merchantId: string, vehicleId: string, hirerId: string, days = 3) {
  const pricing = computeBookingPricing(420000, days);
  const dropoffAt = new Date(Date.now() - 5 * DAY_MS);
  const result = await db.raw<{ rows: { n: string }[] }>("select nextval('booking_ref_seq') as n");

  const [booking] = await db("bookings")
    .insert({
      id: generateId("booking"),
      ref: `CB-${result.rows[0]!.n}`,
      merchant_id: merchantId,
      vehicle_id: vehicleId,
      hirer_id: hirerId,
      status: "completed",
      pickup_at: new Date(dropoffAt.getTime() - days * DAY_MS),
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
      returned_at: dropoffAt,
      deposit_release_at: new Date(dropoffAt.getTime() + DAY_MS),
      deposit_released: true,
    })
    .returning("*");
  if (!booking) throw new Error("Failed to create payable booking");
  return booking;
}

const DESTINATION = { method: "mpesa", detail: "+254733376061", accountName: "Test Merchant" };

async function cut(merchantId: string, options: Parameters<typeof cutPayoutRun>[3] = {}) {
  return db.transaction((trx) => cutPayoutRun(trx, merchantId, DESTINATION, options));
}

describe("merchant payouts", () => {
  it("cuts a run whose totals are the sum of its line snapshots", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer();
    const a = await payableBooking(merchant.merchantId, vehicle.id, hirer.id, 3);
    const b = await payableBooking(merchant.merchantId, vehicle.id, hirer.id, 2);

    const run = await cut(merchant.merchantId);
    expect(run).not.toBeNull();
    expect(run!.ref).toMatch(/^PAY-\d{4}$/);
    expect(run!.status).toBe("scheduled");
    expect(run!.gross_amount).toBe(a.gross_amount + b.gross_amount);
    expect(run!.commission_amount).toBe(a.commission_amount + b.commission_amount);
    expect(run!.net_amount).toBe(a.merchant_net_amount + b.merchant_net_amount);

    const lines = await db("payout_run_lines").where({ payout_run_id: run!.id });
    expect(lines).toHaveLength(2);
    expect(lines.reduce((s, l) => s + l.net_amount, 0)).toBe(run!.net_amount);
  });

  it("never pays the same booking twice", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer();
    await payableBooking(merchant.merchantId, vehicle.id, hirer.id);

    const first = await cut(merchant.merchantId);
    expect(first).not.toBeNull();

    // Nothing left to pay, so no second run at all.
    const second = await cut(merchant.merchantId);
    expect(second).toBeNull();
  });

  it("returns null rather than cutting an empty run", async () => {
    const merchant = await newMerchant();
    expect(await cut(merchant.merchantId)).toBeNull();
  });

  it("excludes bookings whose deposit hold has not lapsed", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer();
    const booking = await payableBooking(merchant.merchantId, vehicle.id, hirer.id);
    await db("bookings").where({ id: booking.id }).update({ deposit_released: false });

    expect(await cut(merchant.merchantId)).toBeNull();
  });

  it("lists only the caller's own runs", async () => {
    const mine = await newMerchant();
    const theirs = await newMerchant();
    const hirer = await newHirer();
    await payableBooking(mine.merchantId, (await newVehicle(mine.merchantId)).id, hirer.id);
    await payableBooking(theirs.merchantId, (await newVehicle(theirs.merchantId)).id, hirer.id);
    await cut(mine.merchantId);
    await cut(theirs.merchantId);

    const res = await request(app).get("/merchant/payouts").set(auth(mine.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.summary.run_count).toBe(1);
  });

  it("404s a run belonging to another merchant", async () => {
    const mine = await newMerchant();
    const theirs = await newMerchant();
    const hirer = await newHirer();
    await payableBooking(theirs.merchantId, (await newVehicle(theirs.merchantId)).id, hirer.id);
    const run = await cut(theirs.merchantId);

    const res = await request(app).get(`/merchant/payouts/${run!.id}`).set(auth(mine.accessToken));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("payout_run_not_found");
  });

  it("returns detail with clickable booking ids and a composed footnote", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer("Josphat Ndegwa");
    const booking = await payableBooking(merchant.merchantId, vehicle.id, hirer.id);
    const run = await cut(merchant.merchantId);

    const res = await request(app).get(`/merchant/payouts/${run!.id}`).set(auth(merchant.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(1);
    // This is what makes a line clickable through to the booking screen.
    expect(res.body.lines[0].booking_id).toBe(booking.id);
    expect(res.body.lines[0].booking_ref).toBe(booking.ref);
    expect(res.body.lines[0].hirer_name).toBe("Josphat Ndegwa");
    expect(res.body.footnote).toContain("goes out on");
    expect(res.body.destination.method).toBe("mpesa");
  });

  it("counts a scheduled run in the next-payout tile", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer();
    await payableBooking(merchant.merchantId, vehicle.id, hirer.id);
    const run = await cut(merchant.merchantId);

    const res = await request(app).get("/merchant/payouts").set(auth(merchant.accessToken));
    const tile = res.body.summary.tiles.find((t: { key: string }) => t.key === "next_payout");
    // The tile and the row beneath it must agree — see buildSummary's note.
    expect(tile.amount.amount).toBe(run!.net_amount);
    expect(res.body.summary.bars).toHaveLength(8);
  });

  it("serves the receipt as a real PDF", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer();
    await payableBooking(merchant.merchantId, vehicle.id, hirer.id);
    const run = await cut(merchant.merchantId, {
      markPaid: { providerCode: "SJ2H88TP4C", paidAt: new Date() },
    });

    const res = await request(app)
      .get(`/merchant/payouts/${run!.id}/receipt`)
      .set(auth(merchant.accessToken))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain(`${run!.ref}-receipt.pdf`);
    expect(res.body.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("serves a month's statement as CSV with a totals row", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer("Alice, Njoki");
    const booking = await payableBooking(merchant.merchantId, vehicle.id, hirer.id);
    const today = new Date();
    const month = new Date(today.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
    await cut(merchant.merchantId, { runDate: `${month}-15` });

    const res = await request(app)
      .get(`/merchant/payouts/statement?month=${month}`)
      .set(auth(merchant.accessToken));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain(`cral-statement-${month}.csv`);

    const text = res.text ?? res.body.toString();
    const rows = text.trim().split("\r\n");
    expect(rows[0]).toContain("Payout ref");
    expect(rows.at(-1)).toMatch(/^TOTAL,/);
    // A comma in a hirer's name must not shift a column.
    expect(text).toContain('"Alice, Njoki"');
    expect(text).toContain(booking.ref);
    // Totals line carries the run's net, in major units.
    expect(rows.at(-1)).toContain((booking.merchant_net_amount / 100).toFixed(2));
  });

  it("returns an empty but well-formed statement for a month with no runs", async () => {
    const merchant = await newMerchant();
    const res = await request(app).get("/merchant/payouts/statement?month=2019-03").set(auth(merchant.accessToken));
    expect(res.status).toBe(200);
    const rows = (res.text ?? "").trim().split("\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toBe("TOTAL,,,,,,,,,0.00,0.00,0.00");
  });

  it("rejects a malformed statement month", async () => {
    const merchant = await newMerchant();
    const res = await request(app).get("/merchant/payouts/statement?month=August").set(auth(merchant.accessToken));
    expect(res.status).toBe(422);
  });

  it("records a query, audits it in the same transaction, and replays on a repeated key", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer();
    await payableBooking(merchant.merchantId, vehicle.id, hirer.id);
    const run = await cut(merchant.merchantId);

    const key = idem();
    const first = await request(app)
      .post(`/merchant/payouts/${run!.id}/queries`)
      .set(auth(merchant.accessToken))
      .set(key)
      .send({ message: "The commission looks wrong on CB-2811." });

    expect(first.status).toBe(201);
    expect(first.body.status).toBe("filed");

    const replay = await request(app)
      .post(`/merchant/payouts/${run!.id}/queries`)
      .set(auth(merchant.accessToken))
      .set(key)
      .send({ message: "The commission looks wrong on CB-2811." });

    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);

    const rows = await db("payout_queries").where({ payout_run_id: run!.id });
    expect(rows).toHaveLength(1);

    const audit = await db("audit_log").where({ entity_type: "payout_run", entity_id: run!.id });
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("payout_query.created");

    const listed = await request(app).get(`/merchant/payouts/${run!.id}/queries`).set(auth(merchant.accessToken));
    expect(listed.body.data).toHaveLength(1);

    const detail = await request(app).get(`/merchant/payouts/${run!.id}`).set(auth(merchant.accessToken));
    expect(detail.body.open_query_count).toBe(1);
  });

  it("requires an Idempotency-Key to raise a query", async () => {
    const merchant = await newMerchant();
    const vehicle = await newVehicle(merchant.merchantId);
    const hirer = await newHirer();
    await payableBooking(merchant.merchantId, vehicle.id, hirer.id);
    const run = await cut(merchant.merchantId);

    const res = await request(app)
      .post(`/merchant/payouts/${run!.id}/queries`)
      .set(auth(merchant.accessToken))
      .send({ message: "No key on this one." });

    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/merchant/payouts")).status).toBe(401);
  });
});

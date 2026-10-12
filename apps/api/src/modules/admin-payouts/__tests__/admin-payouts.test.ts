import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { createTestAdmin, createTestBooking, createVerifiedTestUser } from "../../../test/helpers.js";
import { cutDuePayoutRuns, payoutDueOn } from "../../payouts/schedule.js";

/**
 * Ops Finance payouts and the scheduled cut. The disbursement rail is the
 * console adapter here (the test default), which settles in its ack - so
 * Pay goes scheduled -> processing -> paid in one request.
 */

const app = createApp();
const userIds: string[] = [];
const merchantIds: string[] = [];
const bookingIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  const runIds = (await db("payout_runs").whereIn("merchant_id", merchantIds).pluck("id")) as string[];
  await db("disbursements").whereIn("payout_run_id", runIds).delete();
  await db("payout_run_lines").whereIn("payout_run_id", runIds).delete();
  await db("notifications").whereIn("merchant_id", merchantIds).delete();
  await db("payout_runs").whereIn("id", runIds).delete();
  await db("bookings").whereIn("id", bookingIds).delete();
  await db("vehicles").whereIn("merchant_id", merchantIds).delete();
  await db("merchants").whereIn("id", merchantIds).delete();
  await db("admin_sessions").whereIn("admin_user_id", adminIds).delete();
  await db("admin_users").whereIn("id", adminIds).delete();
  await db("sessions").whereIn("user_id", userIds).delete();
  await db("users").whereIn("id", userIds).delete();
  await db.destroy();
});

// The 01xx range, so these never collide with the +2547 numbers other
// suites generate against the same database.
let phoneSeed = 10_000_000 + Math.floor(Math.random() * 89_000_000);

/** A merchant with one completed, cleared KES 4,500 hire waiting to be paid. */
async function merchantOwed(options: { verifiedPhone?: boolean; schedule?: string } = {}) {
  const hirer = await createVerifiedTestUser();
  const booking = await createTestBooking(
    hirer.userId,
    { status: "completed", deposit_released: true, dropoff_at: new Date(Date.now() - 3 * 86_400_000) },
    { payout_schedule: options.schedule ?? "weekly" },
  );
  userIds.push(hirer.userId, booking.ownerUserId);
  merchantIds.push(booking.merchantId);
  bookingIds.push(booking.bookingId);
  phoneSeed += 1;
  await db("users")
    .where({ id: booking.ownerUserId })
    .update({ phone: `+2541${String(phoneSeed).slice(-8)}`, phone_verified: options.verifiedPhone ?? true });
  return booking;
}

async function finance() {
  const a = await createTestAdmin("admin_finance");
  adminIds.push(a.adminId);
  return { Authorization: `Bearer ${a.token}` };
}

describe("payoutDueOn", () => {
  it("is Mondays for weekly M-Pesa, the 1st for monthly and for bank", () => {
    expect(payoutDueOn("2026-10-12", "mpesa", "weekly")).toBe(true); // a Monday
    expect(payoutDueOn("2026-10-13", "mpesa", "weekly")).toBe(false);
    expect(payoutDueOn("2026-11-01", "mpesa", "monthly")).toBe(true);
    expect(payoutDueOn("2026-10-12", "mpesa", "monthly")).toBe(false);
    expect(payoutDueOn("2026-11-01", "bank", "weekly")).toBe(true);
    expect(payoutDueOn("2026-10-12", "bank", "weekly")).toBe(false);
  });
});

describe("cutDuePayoutRuns", () => {
  const monday = new Date("2026-10-12T04:00:00Z"); // 07:00 Nairobi, a Monday

  it("cuts a run for a merchant due today, frozen to their verified line", async () => {
    const m = await merchantOwed();
    const result = await cutDuePayoutRuns(monday, [m.merchantId]);
    expect(result.cut).toBe(1);
    const run = await db("payout_runs").where({ merchant_id: m.merchantId }).first();
    expect(run).toMatchObject({ status: "scheduled", run_date: "2026-10-12", destination_method: "mpesa", net_amount: 450_000 });
  });

  it("leaves a merchant who isn't due, and skips one with no verified line", async () => {
    const monthly = await merchantOwed({ schedule: "monthly" });
    const unverified = await merchantOwed({ verifiedPhone: false });
    const result = await cutDuePayoutRuns(monday, [monthly.merchantId, unverified.merchantId]);
    expect(result.cut).toBe(0);
    expect(result.skipped).toEqual([{ merchantId: unverified.merchantId, reason: "payout_phone_unverified" }]);
  });
});

describe("/admin/payout-runs", () => {
  it("is Finance's - a reviewer is refused", async () => {
    const reviewer = await createTestAdmin("admin_reviewer");
    adminIds.push(reviewer.adminId);
    const res = await request(app).get("/admin/payout-runs").set({ Authorization: `Bearer ${reviewer.token}` });
    expect(res.status).toBe(403);
  });

  it("cuts now, lists it as open, pays it, and refuses to pay it twice", async () => {
    const auth = await finance();
    const m = await merchantOwed();

    const cut = await request(app)
      .post("/admin/payout-runs")
      .set(auth)
      .set("Idempotency-Key", ulid())
      .send({ merchant_id: m.merchantId });
    expect(cut.status).toBe(201);
    expect(cut.body).toMatchObject({ status: "scheduled", hires: 1, can_pay: true, sendable: { amount: 450_000, currency: "KES" } });
    const runId = cut.body.id as string;

    const open = await request(app).get("/admin/payout-runs?limit=100").set(auth);
    expect(open.status).toBe(200);
    expect(open.body.counts.scheduled).toBeGreaterThanOrEqual(1);

    const pay = await request(app).post(`/admin/payout-runs/${runId}/pay`).set(auth).set("Idempotency-Key", ulid());
    expect(pay.status).toBe(200);
    expect(pay.body).toMatchObject({ status: "paid", can_pay: false });
    expect(pay.body.attempts).toHaveLength(1);
    expect(pay.body.attempts[0]).toMatchObject({ status: "success", channel: "mpesa" });
    expect(pay.body.lines).toHaveLength(1);

    const again = await request(app).post(`/admin/payout-runs/${runId}/pay`).set(auth).set("Idempotency-Key", ulid());
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("payout_run_not_payable");

    const audit = await db("audit_log").where({ entity_id: runId, action: "payout_run.pay" }).first();
    expect(audit.actor_type).toBe("admin");
  });

  it("needs an Idempotency-Key to pay", async () => {
    const auth = await finance();
    const res = await request(app).post("/admin/payout-runs/pot_x/pay").set(auth);
    expect(res.status).toBe(400);
  });

  it("says when there's nothing to cut", async () => {
    const auth = await finance();
    const hirer = await createVerifiedTestUser();
    const booking = await createTestBooking(hirer.userId);
    userIds.push(hirer.userId, booking.ownerUserId);
    merchantIds.push(booking.merchantId);
    bookingIds.push(booking.bookingId);
    const res = await request(app)
      .post("/admin/payout-runs")
      .set(auth)
      .set("Idempotency-Key", ulid())
      .send({ merchant_id: booking.merchantId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("nothing_payable");
  });

  it("refuses to pay in production without a real rail, and leaves the run scheduled", async () => {
    const auth = await finance();
    const m = await merchantOwed();
    const cut = await request(app)
      .post("/admin/payout-runs")
      .set(auth)
      .set("Idempotency-Key", ulid())
      .send({ merchant_id: m.merchantId });
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await request(app).post(`/admin/payout-runs/${cut.body.id}/pay`).set(auth).set("Idempotency-Key", ulid());
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("payout_rail_unconfigured");
    } finally {
      process.env.NODE_ENV = previous;
    }
    expect((await db("payout_runs").where({ id: cut.body.id }).first()).status).toBe("scheduled");
  });
});

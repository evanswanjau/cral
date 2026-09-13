import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createTestAdmin, createVerifiedTestUser } from "../../../test/helpers.js";

/**
 * Read-only Ops visibility into bookings. No decision endpoints here -
 * just confirming the directory renders the right names and figures, and
 * that hirer_id_verified reflects the same documents admin-renters reads.
 */

const app = createApp();
const userIds: string[] = [];
const merchantIds: string[] = [];
const bookingIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  if (bookingIds.length) await db("bookings").whereIn("id", bookingIds).delete();
  if (merchantIds.length) {
    await db("vehicles").whereIn("merchant_id", merchantIds).delete();
    await db("merchants").whereIn("id", merchantIds).delete();
  }
  if (userIds.length) {
    await db("documents").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function newAdmin(role: Parameters<typeof createTestAdmin>[0] = "admin_super", queues: string[] = []) {
  const a = await createTestAdmin(role, queues);
  adminIds.push(a.adminId);
  return a;
}

async function merchantWithVehicle() {
  const owner = await createVerifiedTestUser();
  userIds.push(owner.userId);
  await db("users").where({ id: owner.userId }).update({ full_name: "Peter Mwangi" });

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

  const vehicleId = generateId("vehicle");
  await db("vehicles").insert({
    id: vehicleId,
    merchant_id: merchantId,
    type: "sedan",
    make: "Toyota",
    model: "Corolla",
    year: "2020",
    registration: `KA${ulid().slice(-5).toUpperCase()}`,
    transmission: "Automatic",
    fuel: "Petrol",
    seats: 5,
    county: "Nairobi",
    daily_rate_amount: 400_000,
    daily_rate_currency: "KES",
    minimum_hire_days: 1,
    chauffeured: false,
    status: "live",
  });

  return { merchantId, vehicleId };
}

async function bookingFor(status: string, docs: Array<"national_id" | "driving_licence"> = []) {
  const hirer = await createVerifiedTestUser();
  userIds.push(hirer.userId);
  await db("users").where({ id: hirer.userId }).update({ full_name: "Brian Kiptoo" });
  for (const kind of docs) {
    await db("documents").insert({
      id: generateId("document"),
      merchant_id: null,
      user_id: hirer.userId,
      vehicle_id: null,
      kind,
      storage_key: `test/${hirer.userId}/${kind}`,
      original_name: `${kind}.pdf`,
      size_bytes: 100,
      content_type: "application/pdf",
      review_state: "ok",
      reviewed_by: "adm_test",
      reviewed_at: new Date(),
    });
  }

  const { merchantId, vehicleId } = await merchantWithVehicle();
  const id = generateId("booking");
  await db("bookings").insert({
    id,
    ref: `CB-${Math.floor(Math.random() * 900000 + 100000)}`,
    merchant_id: merchantId,
    vehicle_id: vehicleId,
    hirer_id: hirer.userId,
    status,
    pickup_at: new Date(Date.now() + 3 * 86400e3),
    dropoff_at: new Date(Date.now() + 5 * 86400e3),
    pickup_location: "Nairobi",
    dropoff_location: "Nairobi",
    gross_amount: 800_000,
    gross_currency: "KES",
    commission_amount: 80_000,
    commission_currency: "KES",
    merchant_net_amount: 720_000,
    merchant_net_currency: "KES",
    deposit_amount: 0,
    deposit_currency: "KES",
    payout_method: "mpesa",
    payout_detail: "0722000000",
    payout_account_name: "Peter Mwangi",
  });
  bookingIds.push(id);
  return { id, hirerId: hirer.userId };
}

describe("the bookings directory is ops-only, on the bookings queue", () => {
  it("refuses a hirer token, and an admin without the bookings queue", async () => {
    const hirer = await createVerifiedTestUser();
    userIds.push(hirer.userId);
    expect((await request(app).get("/admin/bookings").set(bearer(hirer.accessToken))).status).toBe(401);

    const reviewerWrongRole = await newAdmin("admin_reviewer", ["bookings"]);
    expect((await request(app).get("/admin/bookings").set(bearer(reviewerWrongRole.token))).status).toBe(403);

    const supportNoQueue = await newAdmin("admin_support", ["vehicles"]);
    expect((await request(app).get("/admin/bookings").set(bearer(supportNoQueue.token))).status).toBe(403);

    const support = await newAdmin("admin_support", ["bookings"]);
    expect((await request(app).get("/admin/bookings").set(bearer(support.token))).status).toBe(200);
  });
});

describe("the directory", () => {
  it("lists a booking with real names, and filters by status", async () => {
    const admin = await newAdmin();
    const { id } = await bookingFor("requested");

    const all = await request(app).get("/admin/bookings").set(bearer(admin.token));
    expect(all.status).toBe(200);
    const row = all.body.data.find((b: { id: string }) => b.id === id);
    expect(row).toBeTruthy();
    expect(row.hirer_name).toBe("Brian Kiptoo");
    expect(row.merchant_name).toBe("Peter Mwangi");
    expect(row.vehicle_label).toContain("Toyota Corolla 2020");
    expect(row.gross.amount).toBe(800_000);

    const completedOnly = await request(app)
      .get("/admin/bookings")
      .query({ status: "completed" })
      .set(bearer(admin.token));
    expect(completedOnly.body.data.map((b: { id: string }) => b.id)).not.toContain(id);
  });
});

describe("detail", () => {
  it("reflects hirer_id_verified from the same documents admin-renters reviews", async () => {
    const admin = await newAdmin();
    const unverified = await bookingFor("confirmed", []);
    const verified = await bookingFor("confirmed", ["national_id", "driving_licence"]);

    const a = await request(app).get(`/admin/bookings/${unverified.id}`).set(bearer(admin.token));
    expect(a.body.hirer_id_verified).toBe(false);

    const b = await request(app).get(`/admin/bookings/${verified.id}`).set(bearer(admin.token));
    expect(b.body.hirer_id_verified).toBe(true);
    expect(b.body.payment_status).toBe("none");
  });

  it("404s an id that doesn't exist", async () => {
    const admin = await newAdmin();
    const res = await request(app).get("/admin/bookings/bkg_doesnotexist").set(bearer(admin.token));
    expect(res.status).toBe(404);
  });
});

import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";

/**
 * GET /sitemap.xml. Same load-bearing rule as the catalog itself: it
 * reads through baseCatalogQuery, so a paused listing or an unapproved
 * merchant's car must never be advertised to a crawler.
 */

const app = createApp();
const merchantIds: string[] = [];
const userIds: string[] = [];

afterAll(async () => {
  if (merchantIds.length) {
    await db("vehicles").whereIn("merchant_id", merchantIds).delete();
    await db("merchants").whereIn("id", merchantIds).delete();
  }
  if (userIds.length) await db("users").whereIn("id", userIds).delete();
  await db.destroy();
});

async function merchantWithVehicle(opts: { approved?: boolean; status?: string }) {
  const userId = generateId("user");
  await db("users").insert({
    id: userId,
    email: `sitemap-${ulid().slice(-10).toLowerCase()}@example.test`,
    password_hash: "x",
    roles: ["merchant"],
    email_verified: true,
  });
  userIds.push(userId);

  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: userId,
    owner_type: "individual",
    first_name: "Test",
    surname: "Merchant",
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
    model: "Axio",
    year: "2019",
    registration: `KS${ulid().slice(-5).toUpperCase()}`,
    transmission: "Automatic",
    fuel: "Petrol",
    seats: 5,
    county: "Nairobi",
    daily_rate_amount: 400_000,
    daily_rate_currency: "KES",
    minimum_hire_days: 1,
    chauffeured: false,
    status: opts.status ?? "live",
  });

  return vehicleId;
}

describe("GET /sitemap.xml", () => {
  it("lists the static pages and only publicly-visible vehicles", async () => {
    const visible = await merchantWithVehicle({ approved: true, status: "live" });
    const pausedOne = await merchantWithVehicle({ approved: true, status: "paused" });
    const unapprovedOne = await merchantWithVehicle({ approved: false, status: "live" });

    const res = await request(app).get("/sitemap.xml");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(res.text).toContain("<urlset");
    expect(res.text).toContain("https://cral.co.ke/browse");
    expect(res.text).toContain("https://cral.co.ke/how-it-works");
    expect(res.text).toContain(`/cars/${visible}`);
    expect(res.text).not.toContain(`/cars/${pausedOne}`);
    expect(res.text).not.toContain(`/cars/${unapprovedOne}`);
  });
});

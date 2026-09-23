import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { createTestAdmin, createVerifiedTestUser } from "../../../test/helpers.js";

/**
 * Towing/recovery, the first offering under "Services" (owner's call,
 * 2026-09-23). Lead-capture only: a renter files a request, an admin quotes
 * or declines it by hand, the renter accepts or cancels. No payment rail
 * involved anywhere in this flow.
 */

const app = createApp();
const userIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  if (userIds.length) {
    await db("service_requests").whereIn("user_id", userIds).delete();
    await db("notifications").whereIn("user_id", userIds).delete();
    await db("sessions").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function renter() {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  return u;
}
async function opsAdmin() {
  const a = await createTestAdmin("admin_support", ["services"]);
  adminIds.push(a.adminId);
  return a;
}

const BASE_REQUEST = {
  reason: "mechanical_breakdown" as const,
  pickup_location: "Mombasa Road, near the Bunyala roundabout",
  contact_phone: "+254712345678",
  description: "Engine won't start, hazard lights on at the roadside.",
};

describe("POST /services/towing", () => {
  it("requires auth", async () => {
    const res = await request(app).post("/services/towing").send(BASE_REQUEST);
    expect(res.status).toBe(401);
  });

  it("files a request the renter can then see in their own list", async () => {
    const u = await renter();
    const created = await request(app).post("/services/towing").set(bearer(u.accessToken)).send(BASE_REQUEST);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("requested");
    expect(created.body.quoted_amount).toBeNull();

    const list = await request(app).get("/me/service-requests").set(bearer(u.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data.map((r: { id: string }) => r.id)).toContain(created.body.id);
  });

  it("rejects an unknown reason", async () => {
    const u = await renter();
    const res = await request(app)
      .post("/services/towing")
      .set(bearer(u.accessToken))
      .send({ ...BASE_REQUEST, reason: "flat_tyre" });
    expect(res.status).toBe(422);
  });
});

describe("admin quote → renter accept", () => {
  it("moves requested -> quoted -> accepted, and only the owner can act on it", async () => {
    const u = await renter();
    const other = await renter();
    const admin = await opsAdmin();

    const created = await request(app).post("/services/towing").set(bearer(u.accessToken)).send(BASE_REQUEST);
    const id = created.body.id as string;

    // A different admin queue/role without "services" is refused.
    const wrongQueue = await createTestAdmin("admin_support", []);
    adminIds.push(wrongQueue.adminId);
    const refused = await request(app)
      .post(`/admin/service-requests/${id}/quote`)
      .set(bearer(wrongQueue.token))
      .send({ amount_cents: 500000, note: "KES 5,000 flat, 40km tow." });
    expect(refused.status).toBe(403);

    const quoted = await request(app)
      .post(`/admin/service-requests/${id}/quote`)
      .set(bearer(admin.token))
      .send({ amount_cents: 500000, distance_km: 40, note: "KES 5,000 flat, 40km tow." });
    expect(quoted.status).toBe(200);
    expect(quoted.body.status).toBe("quoted");
    expect(quoted.body.quoted_amount).toEqual({ amount: 500000, currency: "KES" });

    // Someone else's request can't be accepted.
    const wrongOwner = await request(app).post(`/me/service-requests/${id}/accept`).set(bearer(other.accessToken));
    expect(wrongOwner.status).toBe(404);

    const accepted = await request(app).post(`/me/service-requests/${id}/accept`).set(bearer(u.accessToken));
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe("accepted");

    // Can't re-accept once already accepted.
    const again = await request(app).post(`/me/service-requests/${id}/accept`).set(bearer(u.accessToken));
    expect(again.status).toBe(409);

    const completed = await request(app)
      .post(`/admin/service-requests/${id}/complete`)
      .set(bearer(admin.token));
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("completed");
  });

  it("supports a null amount for 'subject to discussion'", async () => {
    const u = await renter();
    const admin = await opsAdmin();
    const created = await request(app).post("/services/towing").set(bearer(u.accessToken)).send(BASE_REQUEST);

    const quoted = await request(app)
      .post(`/admin/service-requests/${created.body.id}/quote`)
      .set(bearer(admin.token))
      .send({ note: "Depends on the tow truck's route - we'll call you." });
    expect(quoted.status).toBe(200);
    expect(quoted.body.quoted_amount).toBeNull();
  });
});

describe("cancel", () => {
  it("lets the renter cancel a still-open request but not a completed one", async () => {
    const u = await renter();
    const admin = await opsAdmin();
    const created = await request(app).post("/services/towing").set(bearer(u.accessToken)).send(BASE_REQUEST);
    const id = created.body.id as string;

    const cancelled = await request(app)
      .post(`/me/service-requests/${id}/cancel`)
      .set(bearer(u.accessToken))
      .send({ reason: "Sorted it myself" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");

    const second = await renter();
    const another = await request(app).post("/services/towing").set(bearer(second.accessToken)).send(BASE_REQUEST);
    await request(app).post(`/admin/service-requests/${another.body.id}/quote`).set(bearer(admin.token)).send({});
    await request(app).post(`/me/service-requests/${another.body.id}/accept`).set(bearer(second.accessToken));
    await request(app).post(`/admin/service-requests/${another.body.id}/complete`).set(bearer(admin.token));

    const tooLate = await request(app)
      .post(`/me/service-requests/${another.body.id}/cancel`)
      .set(bearer(second.accessToken))
      .send({});
    expect(tooLate.status).toBe(409);
  });
});

describe("admin decline", () => {
  it("closes the request with a reason the renter is emailed", async () => {
    const u = await renter();
    const admin = await opsAdmin();
    const created = await request(app).post("/services/towing").set(bearer(u.accessToken)).send(BASE_REQUEST);

    const declined = await request(app)
      .post(`/admin/service-requests/${created.body.id}/decline`)
      .set(bearer(admin.token))
      .send({ reason: "Outside our coverage area." });
    expect(declined.status).toBe(200);
    expect(declined.body.status).toBe("declined");
    expect(declined.body.decline_reason).toBe("Outside our coverage area.");
  });
});

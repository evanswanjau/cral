import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createTestAdmin, createTestDriver, createVerifiedTestUser } from "../../../test/helpers.js";
import { runExpiryNotificationSweep } from "../../notifications/service.js";

const app = createApp();
const userIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  if (userIds.length) await db("users").whereIn("id", userIds).delete();
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": `ad-${ulid()}` });

async function newAdmin(role: Parameters<typeof createTestAdmin>[0] = "admin_super", queues: string[] = []) {
  const a = await createTestAdmin(role, queues);
  adminIds.push(a.adminId);
  return a;
}

async function newMerchant(approved = true): Promise<string> {
  const owner = await createVerifiedTestUser();
  userIds.push(owner.userId);
  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: owner.userId,
    owner_type: "individual",
    first_name: "Fleet",
    surname: "Owner",
    payout_method: "mpesa",
    payout_same: true,
    onboarding_step: 5,
    onboarding_max_step: 5,
    onboarding_screen: "done",
    onboarding_submitted: true,
    approved_at: approved ? new Date() : null,
  });
  return merchantId;
}

describe("admin driver review", () => {
  it("is on the drivers queue", async () => {
    const vehiclesOnly = await newAdmin("admin_reviewer", ["vehicles"]);
    expect((await request(app).get("/admin/drivers").set(bearer(vehiclesOnly.token))).status).toBe(403);
    const reviewer = await newAdmin("admin_reviewer", ["drivers"]);
    expect((await request(app).get("/admin/drivers").set(bearer(reviewer.token))).status).toBe(200);
  });

  it("lists a submitted driver as open, and accepting a document claims the case", async () => {
    const admin = await newAdmin();
    const merchantId = await newMerchant();
    const driverId = await createTestDriver(merchantId, { status: "pending" }, "pending");

    const open = await request(app).get("/admin/drivers").set(bearer(admin.token));
    expect(open.body.data.map((d: { id: string }) => d.id)).toContain(driverId);

    const res = await request(app)
      .post(`/admin/drivers/${driverId}/documents/driving_licence/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ decision: "accept" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("review");
    expect(res.body.documents.find((d: { kind: string }) => d.kind === "driving_licence").state).toBe("ok");
  });

  it("won't approve until the merchant is approved and every document is accepted", async () => {
    const admin = await newAdmin();
    const unapproved = await newMerchant(false);
    const d1 = await createTestDriver(unapproved, { status: "review" }, "ok");
    const blocked = await request(app).post(`/admin/drivers/${d1}/decision`).set(bearer(admin.token)).set(idem()).send({ action: "approve" });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("merchant_not_approved");

    const merchantId = await newMerchant();
    const d2 = await createTestDriver(merchantId, { status: "review" }, "pending");
    const docs = await request(app).post(`/admin/drivers/${d2}/decision`).set(bearer(admin.token)).set(idem()).send({ action: "approve" });
    expect(docs.status).toBe(422);
    expect(docs.body.error.code).toBe("documents_not_all_accepted");

    for (const kind of ["driving_licence", "national_id", "kra_pin"]) {
      await request(app).post(`/admin/drivers/${d2}/documents/${kind}/decision`).set(bearer(admin.token)).set(idem()).send({ decision: "accept" });
    }
    const ok = await request(app).post(`/admin/drivers/${d2}/decision`).set(bearer(admin.token)).set(idem()).send({ action: "approve" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("live");

    const notif = await db("notifications").where({ subject_type: "driver", subject_id: d2 }).orderBy("occurred_at", "desc").first();
    expect(notif?.title).toMatch(/can take bookings/);
    const audit = await db("audit_log").where({ entity_type: "driver", entity_id: d2, action: "driver.approved" }).first();
    expect(audit).toBeTruthy();
  });

  it("requests changes with a note the merchant reads, and needs a reason to reject a document", async () => {
    const admin = await newAdmin();
    const merchantId = await newMerchant();
    const driverId = await createTestDriver(merchantId, { status: "review" }, "pending");

    const noReason = await request(app)
      .post(`/admin/drivers/${driverId}/documents/kra_pin/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ decision: "reject" });
    expect(noReason.status).toBe(422);

    const res = await request(app)
      .post(`/admin/drivers/${driverId}/decision`)
      .set(bearer(admin.token))
      .set(idem())
      .send({ action: "request_changes", note: "The licence photo is blurred." });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("action");
    expect(res.body.reviewer_note).toBe("The licence photo is blurred.");
  });

  it("warns the merchant before a live driver's licence lapses, once", async () => {
    const merchantId = await newMerchant();
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const driverId = await createTestDriver(merchantId, { licence_expiry: soon });
    await runExpiryNotificationSweep();
    await runExpiryNotificationSweep();
    const rows = await db("notifications").where({ subject_type: "driver", subject_id: driverId, category: "expiry" });
    expect(rows).toHaveLength(1);
  });
});

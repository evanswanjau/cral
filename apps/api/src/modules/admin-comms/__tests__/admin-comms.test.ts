import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { createTestAdmin, createVerifiedTestUser } from "../../../test/helpers.js";
import { generateId } from "../../../lib/ids.js";
import { sendCommsRun } from "../../../jobs/comms-bulk-send.js";

const app = createApp();
const userIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  if (userIds.length) {
    await db("comms_runs").whereIn("sent_by", adminIds).delete();
    await db("merchants").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  if (adminIds.length) {
    await db("comms_templates").whereIn("created_by", adminIds).delete();
    await db("admin_users").whereIn("id", adminIds).delete();
  }
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": `test-${ulid()}` });

async function newAdmin(role: Parameters<typeof createTestAdmin>[0] = "admin_super") {
  const a = await createTestAdmin(role);
  adminIds.push(a.adminId);
  return a;
}

/** A contactable merchant: real-shaped phone + email, verified. */
async function newMerchant(opts: { approved?: boolean } = {}): Promise<{ merchantId: string; userId: string }> {
  const u = await createVerifiedTestUser();
  userIds.push(u.userId);
  const phone = `+2547${ulid().slice(-8).replace(/[^0-9]/g, "1")}`;
  await db("users").where({ id: u.userId }).update({ phone, phone_verified: true });

  const [m] = await db("merchants")
    .insert({
      id: generateId("merchant"),
      user_id: u.userId,
      owner_type: "individual",
      first_name: "Wanjiru",
      surname: "Kamau",
      payout_method: "mpesa",
      payout_same: true,
      onboarding_step: 5,
      onboarding_max_step: 5,
      onboarding_screen: "done",
      onboarding_submitted: true,
      ...(opts.approved ? { approved_at: new Date() } : {}),
    })
    .returning("*");
  return { merchantId: m.id, userId: u.userId };
}

describe("Communications is admin_super only", () => {
  it("refuses every other role", async () => {
    const reviewer = await newAdmin("admin_reviewer");
    for (const call of [
      () => request(app).get("/admin/comms/audiences").set(bearer(reviewer.token)),
      () => request(app).get("/admin/comms/templates").set(bearer(reviewer.token)),
      () => request(app).get("/admin/comms/runs").set(bearer(reviewer.token)),
    ]) {
      const res = await call();
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("insufficient_scope");
    }
  });
});

describe("audiences resolve real, live counts", () => {
  it("counts a verified and a pending merchant correctly", async () => {
    const admin = await newAdmin();
    const verified = await newMerchant({ approved: true });
    const pending = await newMerchant({ approved: false });

    const res = await request(app).get("/admin/comms/audiences").set(bearer(admin.token));
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries((res.body.data as Array<{ key: string; count: number }>).map((a) => [a.key, a.count]));
    expect(byKey.all).toBeGreaterThanOrEqual(2);
    expect(byKey.verified).toBeGreaterThanOrEqual(1);
    expect(byKey.pending).toBeGreaterThanOrEqual(1);
    expect(byKey.single).toBe(1);

    // Both of these merchants are individuals with no vehicle - present in
    // "all" but shouldn't blow up "companies" / "expiring".
    void verified;
    void pending;
  });
});

describe("templates: automatic rows are derived, manual rows are real", () => {
  it("lists the six real notification categories plus a newly created manual template", async () => {
    const admin = await newAdmin();

    const created = await request(app)
      .post("/admin/comms/templates")
      .set(bearer(admin.token))
      .send({ label: "Verification pricing", channel: "email", subject: "Pricing update", body: "KES 1,500 per vehicle." });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ label: "Verification pricing", trigger: "manual", use_count: 0 });

    const list = await request(app).get("/admin/comms/templates").set(bearer(admin.token));
    expect(list.status).toBe(200);
    const rows = list.body.data as Array<{ label: string; trigger: string }>;
    expect(rows.filter((r) => r.trigger === "automatic").length).toBe(6);
    expect(rows.some((r) => r.trigger === "manual" && r.label === "Verification pricing")).toBe(true);
  });
});

describe("sending", () => {
  it("requires an audience-appropriate merchant_id, rejects an empty audience, and requires Idempotency-Key", async () => {
    const admin = await newAdmin();

    const noMerchant = await request(app)
      .post("/admin/comms/send")
      .set(bearer(admin.token))
      .set(idem())
      .send({ audience: "single", channel: "sms", body: "hi" });
    expect(noMerchant.status).toBe(422);
    expect(noMerchant.body.error.code).toBe("merchant_id_required");

    // A merchant whose phone is never verified - an SMS-only send to them finds nobody.
    const unverified = await createVerifiedTestUser();
    userIds.push(unverified.userId);
    const [um] = await db("merchants")
      .insert({
        id: generateId("merchant"),
        user_id: unverified.userId,
        owner_type: "individual",
        first_name: "Otieno",
        surname: "Achieng",
        payout_method: "mpesa",
        payout_same: true,
        onboarding_step: 5,
        onboarding_max_step: 5,
        onboarding_screen: "done",
        onboarding_submitted: true,
      })
      .returning("*");
    const emptyAudience = await request(app)
      .post("/admin/comms/send")
      .set(bearer(admin.token))
      .set(idem())
      .send({ audience: "single", merchant_id: um.id, channel: "sms", body: "hi" });
    expect(emptyAudience.status).toBe(422);
    expect(emptyAudience.body.error.code).toBe("empty_audience");

    const { merchantId } = await newMerchant();

    const noKey = await request(app)
      .post("/admin/comms/send")
      .set(bearer(admin.token))
      .send({ audience: "single", merchant_id: merchantId, channel: "sms", body: "hi" });
    expect(noKey.status).toBe(400);
  });

  it("creates a run with the right recipient count, writes an audit row, and shows up in the logs", async () => {
    const admin = await newAdmin();
    const { merchantId } = await newMerchant();

    const sent = await request(app)
      .post("/admin/comms/send")
      .set(bearer(admin.token))
      .set(idem())
      .send({ audience: "single", merchant_id: merchantId, channel: "sms", body: "Habari, testing." });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ recipient_count: 1, status: "sending", audience_key: "single" });

    const runs = await request(app).get("/admin/comms/runs").set(bearer(admin.token));
    expect(runs.status).toBe(200);
    expect(runs.body.data.some((r: { id: string }) => r.id === sent.body.id)).toBe(true);
    expect(runs.body.stats.sent_this_month).toBeGreaterThanOrEqual(1);

    const audit = await db("audit_log").where({ entity_id: sent.body.id, action: "comms.sent" }).first();
    expect(audit).toBeTruthy();
  });
});

describe("the bulk-send job itself", () => {
  it("delivers over the console adapter and marks the run done", async () => {
    const admin = await newAdmin();
    const { merchantId } = await newMerchant();
    const user = await db("users")
      .join("merchants", "merchants.user_id", "users.id")
      .where("merchants.id", merchantId)
      .first("users.phone", "users.phone_verified", "users.email");

    const runId = generateId("commsRun");
    await db("comms_runs").insert({
      id: runId,
      audience_key: "single",
      channel: "sms",
      subject: null,
      body: "Habari, testing the job directly.",
      recipient_count: 1,
      sent_by: admin.adminId,
    });

    await sendCommsRun({
      runId,
      channel: "sms",
      subject: null,
      body: "Habari, testing the job directly.",
      recipients: [{ merchantId, phone: user.phone, phoneVerified: user.phone_verified, email: user.email }],
    });

    const row = await db("comms_runs").where({ id: runId }).first();
    expect(row).toMatchObject({ sent_count: 1, failed_count: 0, status: "done" });
    expect(row.completed_at).toBeTruthy();
  });
});

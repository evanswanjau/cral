import { randomInt } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { emailAdapter } from "../../../lib/adapters.js";
import { createTestAdmin } from "../../../test/helpers.js";

const app = createApp();
const adminIds: string[] = [];
const emails: string[] = [];

afterAll(async () => {
  if (emails.length) {
    const userIds = (await db("users").whereIn("email", emails).select("id")).map((u) => u.id);
    if (userIds.length) {
      await db("merchants").whereIn("user_id", userIds).delete();
      await db("users").whereIn("id", userIds).delete();
    }
  }
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

const emailSpy = vi.spyOn(emailAdapter, "send");
beforeEach(() => emailSpy.mockClear());

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": `test-${ulid()}` });

async function newAdmin(role: Parameters<typeof createTestAdmin>[0] = "admin_sales", queues: string[] = []) {
  const a = await createTestAdmin(role, queues);
  adminIds.push(a.adminId);
  return a;
}

function newEmail(): string {
  const e = `agent-merchant-${ulid().slice(-10).toLowerCase()}@example.test`;
  emails.push(e);
  return e;
}

/** A fresh, valid Kenyan mobile in the 07xx form agents type. */
function newPhone(): string {
  return `07${randomInt(10_000_000, 99_999_999)}`;
}

function lastInviteToken(): string {
  const text = emailSpy.mock.calls.at(-1)?.[0]?.text ?? "";
  return /reset-password\?token=([\w-]+)/.exec(text)?.[1] ?? "";
}

async function addMerchant(
  token: string,
  body: Partial<{ owner_type: string; name: string; email: string; phone: string }> = {},
) {
  return request(app)
    .post("/admin/agents/merchants")
    .set(bearer(token))
    .set(idem())
    .send({
      owner_type: "individual",
      name: "Jane Wanjiru Kamau",
      email: newEmail(),
      phone: newPhone(),
      ...body,
    });
}

describe("sales agents - add merchant", () => {
  it("creates the user + merchant, attributes it, audits it and emails a set-your-password link", async () => {
    const agent = await newAdmin();
    const email = newEmail();

    const res = await addMerchant(agent.token, { email, name: "  Jane   Wanjiru Kamau " });
    expect(res.status).toBe(201);
    expect(res.body.invite_sent).toBe(true);
    expect(res.body.merchant).toMatchObject({
      owner_type: "individual",
      name: "Jane Wanjiru Kamau",
      email,
      status: "invited",
      invite_pending: true,
      onboarding_source: "agent_invite",
      onboarding: { step: 1, of: 5, label: "Welcome" },
      agent: { id: agent.adminId },
    });
    expect(res.body.merchant.phone).toMatch(/^\+2547\d{8}$/);

    const user = await db("users").where({ email }).first();
    expect(user.roles).toEqual(["merchant"]);
    expect(user.invited_at).not.toBeNull();
    expect(user.invite_accepted_at).toBeNull();
    expect(user.email_verified).toBe(false);
    expect(user.phone_verified).toBe(false);
    expect(user.terms_accepted_version).toBeNull();

    const merchant = await db("merchants").where({ user_id: user.id }).first();
    expect(merchant.onboarded_by).toBe(agent.adminId);
    expect(merchant.onboarding_source).toBe("agent_invite");
    expect(merchant.first_name).toBe("Jane");
    expect(merchant.middle_name).toBe("Wanjiru");
    expect(merchant.surname).toBe("Kamau");
    expect(merchant.approved_at).toBeNull();

    const audit = await db("audit_log").where({ entity_id: merchant.id, action: "merchant.agent_invite" }).first();
    expect(audit.actor_id).toBe(agent.adminId);
    expect(audit.actor_type).toBe("admin");

    const sent = emailSpy.mock.calls.at(-1)?.[0];
    expect(sent?.to).toBe(email);
    expect(sent?.subject).toBe("Set your password and finish setting up");
    expect(lastInviteToken()).not.toBe("");
    // The raw token is never stored, only its hash.
    const row = await db("password_reset_tokens").where({ user_id: user.id }).first();
    expect(row.purpose).toBe("invite");
    expect(row.token_hash).not.toBe(lastInviteToken());

    // Nobody can sign in with any password until the owner sets one.
    const login = await request(app)
      .post("/auth/login")
      .send({ identifier: email, password: "correct horse battery staple", device_id: "dev_agent" });
    expect(login.status).toBe(401);
  });

  it("a company gets its name as the company name and the bank payout path", async () => {
    const agent = await newAdmin();
    const res = await addMerchant(agent.token, { owner_type: "company", name: "Kamau Haulage Ltd" });
    expect(res.status).toBe(201);
    expect(res.body.merchant.name).toBe("Kamau Haulage Ltd");

    const merchant = await db("merchants").where({ id: res.body.merchant.id }).first();
    expect(merchant.owner_type).toBe("company");
    expect(merchant.company_name).toBe("Kamau Haulage Ltd");
    expect(merchant.payout_method).toBe("bank");
  });

  it("refuses an email or phone already on a CRAL account, naming which", async () => {
    const agent = await newAdmin();
    const email = newEmail();
    const phone = newPhone();
    expect((await addMerchant(agent.token, { email, phone })).status).toBe(201);

    const sameEmail = await addMerchant(agent.token, { email });
    expect(sameEmail.status).toBe(409);
    expect(sameEmail.body.error.code).toBe("account_exists");
    expect(sameEmail.body.error.field).toBe("email");

    const samePhone = await addMerchant(agent.token, { phone: `+254${phone.slice(1)}` });
    expect(samePhone.status).toBe(409);
    expect(samePhone.body.error.field).toBe("phone");
  });

  it("rejects a phone that isn't a Kenyan mobile", async () => {
    const agent = await newAdmin();
    const res = await addMerchant(agent.token, { phone: "12345" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("invalid_phone");
  });

  it("requires an Idempotency-Key", async () => {
    const agent = await newAdmin();
    const res = await request(app)
      .post("/admin/agents/merchants")
      .set(bearer(agent.token))
      .send({ owner_type: "individual", name: "No Key", email: newEmail(), phone: newPhone() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("idempotency_key_required");
  });
});

describe("sales agents - scoping", () => {
  it("other admin roles can't reach the agent endpoints", async () => {
    for (const role of ["admin_reviewer", "admin_finance", "admin_support"] as const) {
      const other = await newAdmin(role, ["vehicles", "merchants"]);
      expect((await request(app).get("/admin/agents/merchants").set(bearer(other.token))).status).toBe(403);
      expect((await addMerchant(other.token)).status).toBe(403);
    }
  });

  it("an agent can't reach review queues, payouts, team or comms", async () => {
    const agent = await newAdmin();
    for (const path of [
      "/admin/vehicles",
      "/admin/drivers",
      "/admin/merchants",
      "/admin/renters",
      "/admin/bookings",
      "/admin/payout-runs",
      "/admin/team",
      "/admin/service-requests",
      "/admin/comms/runs",
    ]) {
      const res = await request(app).get(path).set(bearer(agent.token));
      expect(res.status, path).toBe(403);
    }
  });

  it("an agent sees only its own merchants; admin_super sees every agent's", async () => {
    const a = await newAdmin();
    const b = await newAdmin();
    const owner = await newAdmin("admin_super");

    const fromA = (await addMerchant(a.token)).body.merchant.id as string;
    const fromB = (await addMerchant(b.token)).body.merchant.id as string;

    const listA = await request(app).get("/admin/agents/merchants?limit=100").set(bearer(a.token));
    expect(listA.status).toBe(200);
    const idsA = listA.body.data.map((m: { id: string }) => m.id);
    expect(idsA).toContain(fromA);
    expect(idsA).not.toContain(fromB);
    expect(listA.body.total).toBe(1);

    // Another agent's merchant reads as not found, not forbidden.
    const resend = await request(app)
      .post(`/admin/agents/merchants/${fromA}/resend-invite`)
      .set(bearer(b.token))
      .set(idem());
    expect(resend.status).toBe(404);
    expect(resend.body.error.code).toBe("merchant_not_found");

    const all = await request(app).get("/admin/agents/merchants?limit=100").set(bearer(owner.token));
    const allIds = all.body.data.map((m: { id: string }) => m.id);
    expect(allIds).toEqual(expect.arrayContaining([fromA, fromB]));
  });

  it("a self sign-up never shows up on any agent's list", async () => {
    const owner = await newAdmin("admin_super");
    const res = await request(app).get("/admin/agents/merchants?limit=100").set(bearer(owner.token));
    for (const m of res.body.data as Array<{ onboarding_source: string; agent: unknown }>) {
      expect(m.onboarding_source).not.toBe("self");
      expect(m.agent).not.toBeNull();
    }
  });

  it("searches by name, by phone digits typed any way, and pages by cursor", async () => {
    const agent = await newAdmin();
    const phone = newPhone();
    const target = (await addMerchant(agent.token, { name: "Otieno Ochieng", phone })).body.merchant.id;
    await addMerchant(agent.token, { name: "Someone Else" });
    await addMerchant(agent.token, { name: "Third Person" });

    const byName = await request(app).get("/admin/agents/merchants?q=otieno").set(bearer(agent.token));
    expect(byName.body.data.map((m: { id: string }) => m.id)).toEqual([target]);

    for (const q of [phone.slice(0, 7), `+254${phone.slice(1, 8)}`, phone.slice(1)]) {
      const byPhone = await request(app)
        .get(`/admin/agents/merchants?q=${encodeURIComponent(q)}`)
        .set(bearer(agent.token));
      expect(byPhone.body.data.map((m: { id: string }) => m.id), q).toContain(target);
    }

    const page1 = await request(app).get("/admin/agents/merchants?limit=2").set(bearer(agent.token));
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.has_more).toBe(true);
    expect(page1.body.total).toBe(3);
    const page2 = await request(app)
      .get(`/admin/agents/merchants?limit=2&cursor=${page1.body.next_cursor}`)
      .set(bearer(agent.token));
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.has_more).toBe(false);
    const seen = [...page1.body.data, ...page2.body.data].map((m: { id: string }) => m.id);
    expect(new Set(seen).size).toBe(3);
  });
});

describe("sales agents - the invite", () => {
  it("the owner sets a password from the link, which accepts the invite and records the terms", async () => {
    const agent = await newAdmin();
    const email = newEmail();
    const added = await addMerchant(agent.token, { email });
    const token = lastInviteToken();
    emailSpy.mockClear();

    const check = await request(app).post("/auth/password/reset/check").send({ token });
    expect(check.status).toBe(200);
    expect(check.body).toMatchObject({ valid: true, purpose: "invite" });

    const set = await request(app)
      .post("/auth/password/reset")
      .send({ token, new_password: "a long and private passphrase", accepted_terms_version: "2026-08-24" });
    expect(set.status).toBe(200);
    // No "your password was reset" alarm for a first password.
    expect(emailSpy).not.toHaveBeenCalled();

    const user = await db("users").where({ email }).first();
    expect(user.invite_accepted_at).not.toBeNull();
    expect(user.email_verified).toBe(true);
    expect(user.terms_accepted_version).toBe("2026-08-24");
    const audit = await db("audit_log").where({ entity_id: user.id, action: "user.invite_accepted" }).first();
    expect(audit).toBeTruthy();

    const login = await request(app)
      .post("/auth/login")
      .send({ identifier: email, password: "a long and private passphrase", device_id: "dev_agent" });
    expect(login.status).toBe(200);

    // The link is single-use.
    const again = await request(app).post("/auth/password/reset/check").send({ token });
    expect(again.body.valid).toBe(false);

    const list = await request(app).get("/admin/agents/merchants?limit=100").set(bearer(agent.token));
    const row = list.body.data.find((m: { id: string }) => m.id === added.body.merchant.id);
    expect(row.invite_pending).toBe(false);
    expect(row.status).toBe("onboarding");

    const resend = await request(app)
      .post(`/admin/agents/merchants/${added.body.merchant.id}/resend-invite`)
      .set(bearer(agent.token))
      .set(idem());
    expect(resend.status).toBe(409);
    expect(resend.body.error.code).toBe("invite_already_accepted");
  });

  it("resend voids the earlier link and sends a fresh one", async () => {
    const agent = await newAdmin();
    const added = await addMerchant(agent.token);
    const first = lastInviteToken();

    const resend = await request(app)
      .post(`/admin/agents/merchants/${added.body.merchant.id}/resend-invite`)
      .set(bearer(agent.token))
      .set(idem());
    expect(resend.status).toBe(200);
    expect(resend.body.invite_sent).toBe(true);
    expect(resend.body.merchant.status).toBe("invited");
    const second = lastInviteToken();
    expect(second).not.toBe(first);

    expect((await request(app).post("/auth/password/reset/check").send({ token: first })).body.valid).toBe(false);
    expect((await request(app).post("/auth/password/reset/check").send({ token: second })).body.valid).toBe(true);

    const audit = await db("audit_log")
      .where({ entity_id: added.body.merchant.id, action: "merchant.invite_resent" })
      .first();
    expect(audit.actor_id).toBe(agent.adminId);
  });

  it("a Forgot-password link accepts a pending invite too", async () => {
    const agent = await newAdmin();
    const email = newEmail();
    await addMerchant(agent.token, { email });

    await request(app).post("/auth/password/forgot").send({ identifier: email });
    const token = lastInviteToken();
    const check = await request(app).post("/auth/password/reset/check").send({ token });
    expect(check.body.purpose).toBe("reset");

    const set = await request(app)
      .post("/auth/password/reset")
      .send({ token, new_password: "another long passphrase here" });
    expect(set.status).toBe(200);
    const user = await db("users").where({ email }).first();
    expect(user.invite_accepted_at).not.toBeNull();
  });

  it("an email the provider refuses keeps the account and says so", async () => {
    const agent = await newAdmin();
    emailSpy.mockRejectedValueOnce(new Error("provider down"));
    const res = await addMerchant(agent.token);
    expect(res.status).toBe(201);
    expect(res.body.invite_sent).toBe(false);
    expect(await db("merchants").where({ id: res.body.merchant.id }).first()).toBeTruthy();
  });
});

describe("sales agents - status chip", () => {
  it("follows the merchant through submitted, changes requested and verified", async () => {
    const agent = await newAdmin();
    const id = (await addMerchant(agent.token)).body.merchant.id as string;
    const statusNow = async () => {
      const res = await request(app).get("/admin/agents/merchants?limit=100").set(bearer(agent.token));
      return res.body.data.find((m: { id: string }) => m.id === id);
    };

    await db("merchants").where({ id }).update({ onboarding_max_step: 3 });
    expect(await statusNow()).toMatchObject({ status: "onboarding", onboarding: { step: 3, label: "Vehicles" } });

    await db("merchants").where({ id }).update({ onboarding_submitted: true });
    expect((await statusNow()).status).toBe("submitted");

    await db("merchants").where({ id }).update({ review_changes_requested_at: new Date() });
    expect((await statusNow()).status).toBe("changes_requested");

    await db("merchants").where({ id }).update({ approved_at: new Date(), review_changes_requested_at: null });
    expect((await statusNow()).status).toBe("verified");
  });
});

describe("Team - the Sales agent role", () => {
  it("admin_super can add an admin_sales, who gets no review queues", async () => {
    const owner = await newAdmin("admin_super");
    const res = await request(app)
      .post("/admin/team")
      .set(bearer(owner.token))
      .set(idem())
      .send({
        email: `sales-${ulid().slice(-8).toLowerCase()}@example.test`,
        phone: newPhone(),
        full_name: "Field Agent",
        role: "admin_sales",
        queues: ["vehicles"],
      });
    expect(res.status).toBe(201);
    expect(res.body.admin.role).toBe("admin_sales");
    expect(res.body.admin.assigned_queues).toEqual([]);
    adminIds.push(res.body.admin.id);
  });
});

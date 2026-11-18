import { randomInt } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { createTestAdmin, createVerifiedTestUser } from "../../../test/helpers.js";

/**
 * Phase 3, PR AG2: each agent's personal sign-up link, crediting an owner
 * who signs up through it, and the owner-only Agent column + filter on Ops
 * Merchants. See `openapi/admin-agents.yaml` and `identity.yaml`.
 */
const app = createApp();
const adminIds: string[] = [];
const emails: string[] = [];
const userIds: string[] = [];

afterAll(async () => {
  const fromEmails = emails.length
    ? (await db("users").whereIn("email", emails).select("id")).map((u) => u.id as string)
    : [];
  const all = [...new Set([...userIds, ...fromEmails])];
  if (all.length) {
    const merchantIds = (await db("merchants").whereIn("user_id", all).select("id")).map((m) => m.id as string);
    if (merchantIds.length) {
      await db("vehicles").whereIn("merchant_id", merchantIds).delete();
      await db("merchants").whereIn("id", merchantIds).delete();
    }
    await db("users").whereIn("id", all).delete();
  }
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": `test-${ulid()}` });

async function newAdmin(role: Parameters<typeof createTestAdmin>[0] = "admin_sales", queues: string[] = []) {
  const a = await createTestAdmin(role, queues);
  adminIds.push(a.adminId);
  return a;
}

function newEmail(): string {
  const e = `agent-link-${ulid().slice(-10).toLowerCase()}@example.test`;
  emails.push(e);
  return e;
}

async function linkOf(token: string): Promise<{ code: string; url: string }> {
  const res = await request(app).get("/admin/agents/link").set(bearer(token));
  expect(res.status).toBe(200);
  return res.body as { code: string; url: string };
}

function register(email: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post("/auth/register")
    .send({
      email,
      password: "a-long-test-password-9481",
      role: "merchant",
      accepted_terms_version: "2026-08-24",
      ...extra,
    });
}

async function merchantFor(email: string) {
  const user = await db("users").where({ email }).first();
  return db("merchants").where({ user_id: user.id }).first();
}

describe("sales agents - personal sign-up link", () => {
  it("issues one stable code per agent, audited once", async () => {
    const agent = await newAdmin();
    const first = await linkOf(agent.token);
    expect(first.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(first.url).toMatch(new RegExp(`/join\\?a=${first.code}$`));

    // Two tabs at once, then again later: still the same code.
    const [a, b] = await Promise.all([linkOf(agent.token), linkOf(agent.token)]);
    expect(a.code).toBe(first.code);
    expect(b.code).toBe(first.code);

    const audits = await db("audit_log").where({ entity_id: agent.adminId, action: "admin.signup_code_issued" });
    expect(audits).toHaveLength(1);
    expect(audits[0].actor_id).toBe(agent.adminId);
  });

  it("gives two agents different codes", async () => {
    const one = await linkOf((await newAdmin()).token);
    const two = await linkOf((await newAdmin()).token);
    expect(one.code).not.toBe(two.code);
  });

  it("is refused to roles that don't sign merchants up", async () => {
    const reviewer = await newAdmin("admin_reviewer", ["merchants"]);
    const res = await request(app).get("/admin/agents/link").set(bearer(reviewer.token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scope");
  });

  it("credits an owner who signs up through the link, in the same transaction as an audit row", async () => {
    const agent = await newAdmin();
    const { code } = await linkOf(agent.token);
    const email = newEmail();

    // Lower-case, as someone might type it from a poster.
    const res = await register(email, { agent_code: code.toLowerCase() });
    expect(res.status).toBe(201);

    const merchant = await merchantFor(email);
    expect(merchant.onboarded_by).toBe(agent.adminId);
    expect(merchant.onboarding_source).toBe("agent_link");
    expect(merchant.approved_at).toBeNull();

    const audit = await db("audit_log")
      .where({ entity_id: merchant.id, action: "merchant.agent_link_signup" })
      .first();
    expect(audit.actor_type).toBe("user");
    expect(audit.after.onboarded_by).toBe(agent.adminId);

    // The agent sees them on My merchants, marked as through the link.
    const list = await request(app).get("/admin/agents/merchants").set(bearer(agent.token));
    const row = list.body.data.find((m: { id: string }) => m.id === merchant.id);
    expect(row).toMatchObject({ onboarding_source: "agent_link", invite_pending: false, status: "onboarding" });
  });

  it("ignores an unknown code without a word: same response, credited to nobody", async () => {
    const email = newEmail();
    const res = await register(email, { agent_code: "ZZZZZZ" });
    expect(res.status).toBe(201);
    expect(res.body.next).toBe("verify_email");
    // No row until onboarding makes one, exactly like a plain sign-up.
    expect(await merchantFor(email)).toBeUndefined();

    const junk = newEmail();
    expect((await register(junk, { agent_code: "not a code!" })).status).toBe(201);
    expect(await merchantFor(junk)).toBeUndefined();
  });

  it("stops crediting a disabled agent's link, but still lets the owner sign up", async () => {
    const agent = await newAdmin();
    const { code } = await linkOf(agent.token);
    await db("admin_users").where({ id: agent.adminId }).update({ status: "disabled" });

    const email = newEmail();
    expect((await register(email, { agent_code: code })).status).toBe(201);
    expect(await merchantFor(email)).toBeUndefined();
  });

  it("never credits a customer sign-up", async () => {
    const agent = await newAdmin();
    const { code } = await linkOf(agent.token);
    const email = newEmail();
    expect((await register(email, { role: "customer", agent_code: code })).status).toBe(201);
    expect(await merchantFor(email)).toBeUndefined();
  });

  it("keeps the first agent's credit: another agent's link can't take an invited owner", async () => {
    const first = await newAdmin();
    const second = await newAdmin();
    const email = newEmail();
    const invite = await request(app)
      .post("/admin/agents/merchants")
      .set(bearer(first.token))
      .set(idem())
      .send({ owner_type: "individual", name: "Peter Otieno", email, phone: `07${randomInt(10_000_000, 99_999_999)}` });
    expect(invite.status).toBe(201);

    const { code } = await linkOf(second.token);
    const res = await register(email, { agent_code: code });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("account_exists");

    const merchant = await merchantFor(email);
    expect(merchant.onboarded_by).toBe(first.adminId);
    expect(merchant.onboarding_source).toBe("agent_invite");

    // And the second agent can't see them.
    const list = await request(app).get("/admin/agents/merchants").set(bearer(second.token));
    expect(list.body.data.some((m: { id: string }) => m.id === merchant.id)).toBe(false);
  });
});

describe("Ops Merchants - Agent column and filter", () => {
  /** A merchant with one vehicle waiting, so it shows in the directory. */
  async function listedMerchant(onboardedBy: string | null, source = "self") {
    const owner = await createVerifiedTestUser();
    userIds.push(owner.userId);
    const id = generateId("merchant");
    await db("merchants").insert({
      id,
      user_id: owner.userId,
      owner_type: "individual",
      first_name: "Attr",
      surname: "Test",
      onboarded_by: onboardedBy,
      onboarding_source: source,
    });
    await db("vehicles").insert({
      id: generateId("vehicle"),
      merchant_id: id,
      type: "sedan",
      make: "Toyota",
      model: "Axio",
      year: "2019",
      registration: `KA${ulid().slice(-6)}`,
      transmission: "Automatic",
      fuel: "Petrol",
      seats: 5,
      county: "Nairobi",
      daily_rate_amount: 500_000,
      daily_rate_currency: "KES",
      minimum_hire_days: 1,
      chauffeured: false,
      status: "pending",
    });
    return id;
  }

  async function allPages(token: string, query = ""): Promise<Array<Record<string, unknown>>> {
    const rows: Array<Record<string, unknown>> = [];
    let cursor: string | null = null;
    do {
      const qs = [query, "limit=100", cursor ? `cursor=${encodeURIComponent(cursor)}` : ""].filter(Boolean).join("&");
      const res = await request(app).get(`/admin/merchants?${qs}`).set(bearer(token));
      expect(res.status).toBe(200);
      rows.push(...res.body.data);
      cursor = res.body.next_cursor;
    } while (cursor);
    return rows;
  }

  it("shows the owner who brought each merchant in, and filters by agent or none", async () => {
    const owner = await newAdmin("admin_super");
    const agent = await newAdmin();
    await db("admin_users").where({ id: agent.adminId }).update({ full_name: "Grace Akinyi" });

    const viaLink = await listedMerchant(agent.adminId, "agent_link");
    const viaInvite = await listedMerchant(agent.adminId, "agent_invite");
    const self = await listedMerchant(null);

    const all = await allPages(owner.token);
    const byId = new Map(all.map((r) => [r.id, r]));
    expect(byId.get(viaLink)?.agent).toEqual({ id: agent.adminId, name: "Grace Akinyi", via: "agent_link" });
    expect(byId.get(viaInvite)?.agent).toMatchObject({ via: "agent_invite" });
    expect(byId.get(self)?.agent).toBeNull();

    const mine = await allPages(owner.token, `agent=${agent.adminId}`);
    expect(mine.map((r) => r.id).sort()).toEqual([viaLink, viaInvite].sort());

    const none = (await allPages(owner.token, "agent=none")).map((r) => r.id);
    expect(none).toContain(self);
    expect(none).not.toContain(viaLink);

    // The filter's agent list counts both kinds of credit.
    const agents = await request(app).get("/admin/agents").set(bearer(owner.token));
    expect(agents.status).toBe(200);
    expect(agents.body.data.find((a: { id: string }) => a.id === agent.adminId)).toEqual({
      id: agent.adminId,
      name: "Grace Akinyi",
      status: "active",
      merchants: 2,
    });
  });

  it("keeps attribution from reviewers and agents", async () => {
    const reviewer = await newAdmin("admin_reviewer", ["merchants"]);
    const agent = await newAdmin();
    const id = await listedMerchant(agent.adminId, "agent_link");

    const rows = await allPages(reviewer.token);
    const row = rows.find((r) => r.id === id);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("agent");

    const filtered = await request(app).get(`/admin/merchants?agent=${agent.adminId}`).set(bearer(reviewer.token));
    expect(filtered.status).toBe(403);
    expect(filtered.body.error.code).toBe("insufficient_scope");

    expect((await request(app).get("/admin/agents").set(bearer(reviewer.token))).status).toBe(403);
    expect((await request(app).get("/admin/agents").set(bearer(agent.token))).status).toBe(403);
    expect((await request(app).get("/admin/merchants").set(bearer(agent.token))).status).toBe(403);
  });
});

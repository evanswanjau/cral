import { randomInt } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import type { Express } from "express";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { generateId } from "../../../lib/ids.js";
import { hashCode } from "../../../lib/otp.js";
import { smsAdapter } from "../../../lib/adapters.js";
import { ASSIST_ALLOWED_ROUTES } from "../../../lib/assist.js";
import { createTestAdmin, createVerifiedTestUser, testJpeg } from "../../../test/helpers.js";

/**
 * Phase 3, PR AG3: the assist session. The token is a security boundary,
 * so the main test here walks every mounted route rather than a few
 * hand-picked ones. See `lib/assist.ts` and `openapi/admin-agents.yaml`.
 */
const app = createApp();
const adminIds: string[] = [];
const userIds: string[] = [];

afterAll(async () => {
  if (userIds.length) {
    const merchantIds = (await db("merchants").whereIn("user_id", userIds).select("id")).map((m) => m.id as string);
    if (merchantIds.length) {
      await db("documents").whereIn("merchant_id", merchantIds).delete();
      await db("vehicles").whereIn("merchant_id", merchantIds).delete();
      await db("assist_challenges").whereIn("merchant_id", merchantIds).delete();
      await db("merchants").whereIn("id", merchantIds).delete();
    }
    await db("sessions").whereIn("user_id", userIds).delete();
    await db("users").whereIn("id", userIds).delete();
  }
  if (adminIds.length) await db("admin_users").whereIn("id", adminIds).delete();
  await db.destroy();
});

const smsSpy = vi.spyOn(smsAdapter, "send");
beforeEach(() => {
  smsSpy.mockClear();
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const idem = () => ({ "Idempotency-Key": `test-${ulid()}` });

async function newAgent(role: Parameters<typeof createTestAdmin>[0] = "admin_sales") {
  const a = await createTestAdmin(role);
  adminIds.push(a.adminId);
  await db("admin_users").where({ id: a.adminId }).update({ full_name: "Kamau Njoroge" });
  return a;
}

/** An owner the agent brought in, phone verified by the owner, onboarding in progress. */
async function newOwner(agentId: string, opts: { phoneVerified?: boolean } = {}) {
  const owner = await createVerifiedTestUser();
  userIds.push(owner.userId);
  const phone = `+2547${randomInt(10_000_000, 99_999_999)}`;
  await db("users").where({ id: owner.userId }).update({ phone, phone_verified: opts.phoneVerified ?? true });
  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: owner.userId,
    owner_type: "individual",
    first_name: "Jane",
    surname: "Wanjiru",
    payout_method: "mpesa",
    payout_same: true,
    onboarded_by: agentId,
    onboarding_source: "agent_invite",
  });
  return { ...owner, merchantId, phone };
}

function lastSmsCode(): string {
  const body = smsSpy.mock.calls.at(-1)?.[0]?.body ?? "";
  return /Code: (\d{6})/.exec(body)?.[1] ?? "";
}

async function startCode(agentToken: string, merchantId: string) {
  return request(app).post(`/admin/agents/merchants/${merchantId}/assist/start`).set(bearer(agentToken)).set(idem());
}

async function confirm(agentToken: string, merchantId: string, challengeId: string, code: string) {
  return request(app)
    .post(`/admin/agents/merchants/${merchantId}/assist`)
    .set(bearer(agentToken))
    .send({ challenge_id: challengeId, code });
}

/** The whole consent dance; returns the assist token. */
async function assistToken(agentToken: string, merchantId: string): Promise<string> {
  const start = await startCode(agentToken, merchantId);
  expect(start.status).toBe(200);
  const res = await confirm(agentToken, merchantId, start.body.challenge_id, lastSmsCode());
  expect(res.status).toBe(201);
  return res.body.access_token as string;
}

describe("assist session - the owner's consent code", () => {
  it("texts the owner's verified phone, stores only a hash, and is single-use", async () => {
    const agent = await newAgent();
    const owner = await newOwner(agent.adminId);

    const start = await startCode(agent.token, owner.merchantId);
    expect(start.status).toBe(200);
    expect(start.body.challenge_id).toMatch(/^asc_/);
    expect(smsSpy.mock.calls.at(-1)?.[0]?.to).toBe(owner.phone);
    const sms = smsSpy.mock.calls.at(-1)?.[0]?.body ?? "";
    expect(sms).toContain("Kamau from CRAL");
    expect(sms).toContain("in person");

    const code = lastSmsCode();
    const row = await db("assist_challenges").where({ id: start.body.challenge_id }).first();
    expect(row.code_hash).toBe(hashCode(code));
    expect(JSON.stringify(row)).not.toContain(code);

    const ok = await confirm(agent.token, owner.merchantId, start.body.challenge_id, code);
    expect(ok.status).toBe(201);
    expect(ok.body.portal_url).toMatch(/\/assist#token=/);
    expect(ok.body).not.toHaveProperty("refresh_token");

    const again = await confirm(agent.token, owner.merchantId, start.body.challenge_id, code);
    expect(again.status).toBe(410);
    expect(again.body.error.code).toBe("otp_expired");

    const session = await db("sessions").where({ user_id: owner.userId, kind: "assist" }).first();
    expect(session.assisted_by).toBe(agent.adminId);
    expect(new Date(session.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);

    const started = await db("audit_log").where({ entity_id: owner.merchantId, action: "merchant.assist_started" }).first();
    expect(started.actor_id).toBe(agent.adminId);
    expect(started.after.assisted_for).toBe(owner.userId);
  });

  it("refuses an owner whose phone isn't verified: the code must reach a number they proved", async () => {
    const agent = await newAgent();
    const owner = await newOwner(agent.adminId, { phoneVerified: false });
    const res = await startCode(agent.token, owner.merchantId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("phone_not_verified");
    expect(smsSpy).not.toHaveBeenCalled();
  });

  it("refuses a submitted merchant", async () => {
    const agent = await newAgent();
    const owner = await newOwner(agent.adminId);
    await db("merchants").where({ id: owner.merchantId }).update({ onboarding_submitted: true });
    const res = await startCode(agent.token, owner.merchantId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("onboarding_submitted");
  });

  it("locks the code after five wrong tries, and a newer code voids the older one", async () => {
    const agent = await newAgent();
    const owner = await newOwner(agent.adminId);
    const first = await startCode(agent.token, owner.merchantId);
    const firstCode = lastSmsCode();
    const second = await startCode(agent.token, owner.merchantId);
    expect((await confirm(agent.token, owner.merchantId, first.body.challenge_id, firstCode)).status).toBe(410);

    const right = lastSmsCode();
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const res = await confirm(agent.token, owner.merchantId, second.body.challenge_id, wrong);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("otp_incorrect");
    }
    expect((await confirm(agent.token, owner.merchantId, second.body.challenge_id, right)).status).toBe(410);
  });

  it("binds the code to one agent: another agent can't use it, or reach the merchant", async () => {
    const agent = await newAgent();
    const other = await newAgent();
    const owner = await newOwner(agent.adminId);
    const start = await startCode(agent.token, owner.merchantId);
    const res = await confirm(other.token, owner.merchantId, start.body.challenge_id, lastSmsCode());
    expect(res.status).toBe(404);
    expect((await startCode(other.token, owner.merchantId)).status).toBe(404);
  });
});

/** Every route Express has mounted, as `[METHOD, path-pattern]`. */
function mountedRoutes(application: Express): Array<[string, string]> {
  type Layer = { route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: Layer[] } };
  const out: Array<[string, string]> = [];
  const walk = (stack: Layer[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const [method, on] of Object.entries(layer.route.methods)) {
          if (on && method !== "_all") out.push([method.toUpperCase(), layer.route.path]);
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk((application as unknown as { _router: { stack: Layer[] } })._router.stack);
  return out;
}

function fill(path: string): string {
  return path.replace(/:[A-Za-z_]+/g, `zzz_${ulid()}`);
}

function call(method: string, path: string) {
  const agent = request(app);
  switch (method) {
    case "GET":
      return agent.get(path);
    case "POST":
      return agent.post(path);
    case "PUT":
      return agent.put(path);
    case "PATCH":
      return agent.patch(path);
    case "DELETE":
      return agent.delete(path);
    default:
      throw new Error(`unexpected method ${method}`);
  }
}

describe("assist session - the token only reaches onboarding", () => {
  it("walks every mounted route: anything needing a sign-in refuses the assist token", async () => {
    const agent = await newAgent();
    const owner = await newOwner(agent.adminId);
    const token = await assistToken(agent.token, owner.merchantId);

    const routes = mountedRoutes(app);
    expect(routes.length).toBeGreaterThan(100);

    // Every allowlisted route is real, so the list can't hide a typo.
    const keys = new Set(routes.map(([m, p]) => `${m} ${p}`));
    for (const allowed of ASSIST_ALLOWED_ROUTES) expect(keys).toContain(allowed);

    let checked = 0;
    const failures: string[] = [];
    for (const [method, pattern] of routes) {
      const key = `${method} ${pattern}`;
      if (ASSIST_ALLOWED_ROUTES.has(key)) continue;
      const path = fill(pattern);

      // Protected? Ask without any token first.
      const anon = await call(method, path).set("Idempotency-Key", `walk-${ulid()}`);
      if (anon.status !== 401) continue; // a public route: an assist token gets nothing there an anonymous caller doesn't
      checked++;

      const res = await call(method, path).set(bearer(token)).set("Idempotency-Key", `walk-${ulid()}`);
      if (pattern.startsWith("/admin")) {
        // The ops audience never accepts a public-audience token.
        if (res.status !== 401) failures.push(`${key} -> ${res.status}`);
      } else if (res.status !== 403 || res.body?.error?.code !== "assist_scope") {
        failures.push(`${key} -> ${res.status} ${res.body?.error?.code ?? ""}`);
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(50);
  }, 120_000);

  it("can fill in details, vehicles and documents, each write audited as the agent", async () => {
    const agent = await newAgent();
    const owner = await newOwner(agent.adminId);
    const token = await assistToken(agent.token, owner.merchantId);

    const state = await request(app).get("/merchant/onboarding").set(bearer(token));
    expect(state.status).toBe(200);
    expect(state.body.assist).toMatchObject({ agent_name: "Kamau Njoroge" });
    expect(state.body.account_email).toBe(owner.email);

    const patch = await request(app).patch("/merchant/onboarding").set(bearer(token)).send({ national_id: "12345678", step: 2 });
    expect(patch.status).toBe(200);

    const vehicle = await request(app)
      .post("/merchant/onboarding/vehicles")
      .set(bearer(token))
      .send({
        type: "sedan",
        make: "Toyota",
        model: "Axio",
        year: "2019",
        registration: `KD${randomInt(100, 999)}${String.fromCharCode(65 + randomInt(0, 26))}`,
        transmission: "Automatic",
        fuel: "Petrol",
        pickup_address: "Westlands, Nairobi",
        daily_rate: "4500",
      });
    expect(vehicle.status).toBe(201);

    const upload = await request(app)
      .post("/merchant/onboarding/documents")
      .set(bearer(token))
      .field("kind", "kra_pin")
      .attach("file", testJpeg("kra"), { filename: "kra.jpg", contentType: "image/jpeg" });
    expect(upload.status).toBe(201);
    const doc = await db("documents").where({ id: upload.body.document_id }).first();
    expect(doc.uploaded_by_admin_id).toBe(agent.adminId);
    // The agent can read back what they uploaded.
    expect((await request(app).get(`/merchant/onboarding/documents/${doc.id}`).set(bearer(token))).status).toBe(200);

    const audits = await db("audit_log")
      .where({ actor_id: agent.adminId })
      .whereIn("action", ["merchant.onboarding_updated", "vehicle.created", "document.uploaded"]);
    expect(audits.map((a) => a.action).sort()).toEqual(["document.uploaded", "merchant.onboarding_updated", "vehicle.created"]);
    for (const a of audits) {
      expect(a.actor_type).toBe("admin");
      expect(a.after.assisted_for).toBe(owner.userId);
    }
  });

  it("can't touch the phone, payout or terms, submit, or open the owner's own documents", async () => {
    const agent = await newAgent();
    const owner = await newOwner(agent.adminId);

    // The owner uploads their ID themselves first.
    const own = await request(app)
      .post("/merchant/onboarding/documents")
      .set(bearer(owner.accessToken))
      .field("kind", "national_id")
      .attach("file", testJpeg("id"), { filename: "id.jpg", contentType: "image/jpeg" });
    expect(own.status).toBe(201);

    const token = await assistToken(agent.token, owner.merchantId);
    for (const [field, value] of [
      ["phone", "0711111111"],
      ["payout_method", "bank"],
      ["payout_detail", "0722222222"],
      ["payout_same", false],
      ["bank_account_number", "123"],
      ["terms_accepted", true],
    ] as const) {
      const res = await request(app).patch("/merchant/onboarding").set(bearer(token)).send({ [field]: value });
      expect(res.status, field).toBe(403);
      expect(res.body.error).toMatchObject({ code: "assist_scope", field });
    }

    const submit = await request(app).post("/merchant/onboarding/submit").set(bearer(token));
    expect(submit.status).toBe(403);
    expect(submit.body.error.code).toBe("assist_scope");

    const read = await request(app).get(`/merchant/onboarding/documents/${own.body.document_id}`).set(bearer(token));
    expect(read.status).toBe(404);
    const del = await request(app).delete(`/merchant/onboarding/documents/${own.body.document_id}`).set(bearer(token));
    expect(del.status).toBe(404);
  });

  it("can't be refreshed, and an `asb` claim on an ordinary session is refused", async () => {
    const agent = await newAgent();
    const owner = await newOwner(agent.adminId);
    await assistToken(agent.token, owner.merchantId);
    const session = await db("sessions").where({ user_id: owner.userId, kind: "assist" }).first();
    // Its stored hash isn't of anything handed out; presenting it fails too.
    const refresh = await request(app).post("/auth/token/refresh").send({ refresh_token: session.token_hash });
    expect(refresh.status).toBe(401);

    const { signAssistAccessToken } = await import("../../../lib/jwt.js");
    const ownSession = await db("sessions").where({ user_id: owner.userId, kind: "user" }).first();
    const forged = signAssistAccessToken(
      { sub: owner.userId, sid: ownSession.id, roles: ["merchant"], asb: agent.adminId },
      600,
    );
    const res = await request(app).get("/merchant/onboarding").set(bearer(forged));
    expect(res.status).toBe(401);
  });
});

describe("assist session - ending it", () => {
  it("the banner's Exit ends it and audits it", async () => {
    const agent = await newAgent();
    const owner = await newOwner(agent.adminId);
    const token = await assistToken(agent.token, owner.merchantId);

    const end = await request(app).post("/merchant/onboarding/assist/end").set(bearer(token));
    expect(end.status).toBe(200);
    expect(end.body.ended).toBe(1);
    expect((await request(app).get("/merchant/onboarding").set(bearer(token))).status).toBe(401);

    const audit = await db("audit_log").where({ entity_id: owner.merchantId, action: "merchant.assist_ended" }).first();
    expect(audit.actor_id).toBe(agent.adminId);
    expect(audit.after.by).toBe("agent");
  });

  it("the owner sees it and can end it", async () => {
    const agent = await newAgent();
    const owner = await newOwner(agent.adminId);
    const token = await assistToken(agent.token, owner.merchantId);

    const mine = await request(app).get("/merchant/onboarding").set(bearer(owner.accessToken));
    expect(mine.body.assist).toBeNull();
    expect(mine.body.assists[0]).toMatchObject({ agent_name: "Kamau Njoroge", active: true, ended_at: null });

    const end = await request(app).post("/merchant/onboarding/assist/end").set(bearer(owner.accessToken));
    expect(end.body.ended).toBe(1);
    expect((await request(app).get("/merchant/onboarding").set(bearer(token))).status).toBe(401);
    // The owner's own session is untouched.
    expect((await request(app).get("/merchant/onboarding").set(bearer(owner.accessToken))).status).toBe(200);
    const after = await request(app).get("/merchant/onboarding").set(bearer(owner.accessToken));
    expect(after.body.assists[0].active).toBe(false);
  });

  it("stops at submission and when the agent is disabled", async () => {
    const agent = await newAgent();
    const owner = await newOwner(agent.adminId);
    const token = await assistToken(agent.token, owner.merchantId);

    await db("merchants").where({ id: owner.merchantId }).update({ onboarding_submitted: true });
    const submitted = await request(app).get("/merchant/onboarding").set(bearer(token));
    expect(submitted.status).toBe(409);
    expect(submitted.body.error.code).toBe("onboarding_submitted");

    await db("merchants").where({ id: owner.merchantId }).update({ onboarding_submitted: false });
    await db("admin_users").where({ id: agent.adminId }).update({ status: "disabled" });
    expect((await request(app).get("/merchant/onboarding").set(bearer(token))).status).toBe(401);
  });
});

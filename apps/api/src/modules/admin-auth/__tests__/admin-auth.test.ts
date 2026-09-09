import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { smsAdapter } from "../../../lib/adapters.js";
import { generateId } from "../../../lib/ids.js";
import { hashPassword } from "../../../lib/password.js";
import { hashToken } from "../../../lib/tokens.js";
import { createVerifiedTestUser } from "../../../test/helpers.js";
import { signAdminAccessToken, type AdminRole } from "../../../lib/jwt.js";
import { requireAdmin } from "../../../middleware/require-admin.js";
import type { AdminSessionRow } from "../db-types.js";

const app = createApp();
const password = "correct horse battery staple ops";
const createdAdminIds: string[] = [];

function extractCode(message: string): string {
  const match = message.match(/\b(\d{6})\b/);
  if (!match) throw new Error(`No 6-digit code in: ${message}`);
  return match[1] as string;
}

async function makeAdmin(
  role: AdminRole = "admin_super",
  queues: string[] = [],
): Promise<{ id: string; email: string; phone: string }> {
  const suffix = ulid().slice(-10).toLowerCase();
  const email = `ops-${suffix}@example.test`;
  const digits = suffix.replace(/[^0-9]/g, "3").slice(0, 8);
  const phone = `+2547${digits}`;
  const id = generateId("adminUser");
  await db("admin_users").insert({
    id,
    email,
    password_hash: await hashPassword(password),
    phone,
    full_name: "Ops Tester",
    role,
    assigned_queues: queues,
  });
  createdAdminIds.push(id);
  return { id, email, phone };
}

/** Runs the whole login -> 2fa flow and returns the token pair. */
async function signIn(email: string): Promise<{ access_token: string; refresh_token: string }> {
  const smsSpy = vi.spyOn(smsAdapter, "send");
  const loginRes = await request(app)
    .post("/admin/auth/login")
    .send({ email, password, device_id: "dev_ops_test" });
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.next).toBe("2fa");
  expect(loginRes.body.access_token).toBeUndefined();

  const code = extractCode(smsSpy.mock.calls.at(-1)?.[0]?.body ?? "");
  smsSpy.mockRestore();

  const twoFaRes = await request(app)
    .post("/admin/auth/2fa")
    .send({ challenge_token: loginRes.body.challenge_token, code });
  expect(twoFaRes.status).toBe(200);
  expect(twoFaRes.body.access_token).toBeTruthy();
  return twoFaRes.body;
}

afterAll(async () => {
  if (createdAdminIds.length > 0) {
    await db("admin_users").whereIn("id", createdAdminIds).delete(); // cascades sessions + challenges
  }
  await db.destroy();
});

describe("admin sign-in is password then mandatory SMS", () => {
  it("a correct password alone returns no tokens", async () => {
    const { email } = await makeAdmin();
    const res = await request(app)
      .post("/admin/auth/login")
      .send({ email, password, device_id: "d" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ next: "2fa" });
    expect(res.body.challenge_token).toBeTruthy();
    expect(res.body.access_token).toBeUndefined();
    expect(res.body.refresh_token).toBeUndefined();
  });

  it("a wrong password is invalid_admin_credentials, not a hint", async () => {
    const { email } = await makeAdmin();
    const res = await request(app)
      .post("/admin/auth/login")
      .send({ email, password: "nope", device_id: "d" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_admin_credentials");
  });

  it("the texted code completes the sign-in and issues an ops token pair", async () => {
    const { email } = await makeAdmin();
    const pair = await signIn(email);
    expect(pair.access_token).toBeTruthy();
    expect(pair.refresh_token).toBeTruthy();

    const me = await request(app)
      .get("/admin/auth/me")
      .set("Authorization", `Bearer ${pair.access_token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
    expect(me.body.role).toBe("admin_super");
  });

  it("a wrong code is rejected and does not consume the challenge", async () => {
    const { email } = await makeAdmin();
    const smsSpy = vi.spyOn(smsAdapter, "send");
    const loginRes = await request(app)
      .post("/admin/auth/login")
      .send({ email, password, device_id: "d" });
    const code = extractCode(smsSpy.mock.calls.at(-1)?.[0]?.body ?? "");
    smsSpy.mockRestore();

    const bad = await request(app)
      .post("/admin/auth/2fa")
      .send({ challenge_token: loginRes.body.challenge_token, code: "000000" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("admin_two_factor_invalid");

    const good = await request(app)
      .post("/admin/auth/2fa")
      .send({ challenge_token: loginRes.body.challenge_token, code });
    expect(good.status).toBe(200);
  });
});

describe("the ops / public audience boundary runs both ways", () => {
  it("an ops token is refused by a merchant endpoint", async () => {
    const { email } = await makeAdmin();
    const { access_token } = await signIn(email);
    const res = await request(app)
      .get("/merchant/dashboard")
      .set("Authorization", `Bearer ${access_token}`);
    expect(res.status).toBe(401);
  });

  it("a merchant token is refused by an admin endpoint", async () => {
    const { accessToken } = await createVerifiedTestUser();
    const res = await request(app)
      .get("/admin/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });

  it("a fabricated ops token with no session row does not authenticate", async () => {
    const token = signAdminAccessToken({
      sub: generateId("adminUser"),
      sid: generateId("adminSession"),
      role: "admin_super",
    });
    const res = await request(app).get("/admin/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("admin_session_revoked");
  });
});

describe("admin session lifecycle", () => {
  it("refresh rotates the refresh token and a replay of the old one kills the session", async () => {
    const { email } = await makeAdmin();
    const pair = await signIn(email);

    const r1 = await request(app)
      .post("/admin/auth/refresh")
      .send({ refresh_token: pair.refresh_token });
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(pair.refresh_token);

    // Replaying the original (now rotated-away) token is treated as theft.
    const replay = await request(app)
      .post("/admin/auth/refresh")
      .send({ refresh_token: pair.refresh_token });
    expect(replay.status).toBe(401);

    const afterReplay = await request(app)
      .post("/admin/auth/refresh")
      .send({ refresh_token: r1.body.refresh_token });
    expect(afterReplay.status).toBe(401);
  });

  it("logout revokes the session immediately", async () => {
    const { email } = await makeAdmin();
    const pair = await signIn(email);

    const out = await request(app)
      .post("/admin/auth/logout")
      .set("Authorization", `Bearer ${pair.access_token}`);
    expect(out.status).toBe(204);

    const me = await request(app)
      .get("/admin/auth/me")
      .set("Authorization", `Bearer ${pair.access_token}`);
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("admin_session_revoked");
  });

  it("a session idle past 20 minutes is rejected on refresh with idle_timeout_2fa_required", async () => {
    const { email } = await makeAdmin();
    const pair = await signIn(email);

    // Backdate last_seen_at past the idle window.
    await db<AdminSessionRow>("admin_sessions")
      .where({ token_hash: hashToken(pair.refresh_token) })
      .update({ last_seen_at: new Date(Date.now() - 21 * 60 * 1000) });

    const res = await request(app)
      .post("/admin/auth/refresh")
      .send({ refresh_token: pair.refresh_token });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("idle_timeout_2fa_required");
  });

  it("a session past its 8-hour absolute cap cannot refresh", async () => {
    const { email } = await makeAdmin();
    const pair = await signIn(email);

    await db<AdminSessionRow>("admin_sessions")
      .where({ token_hash: hashToken(pair.refresh_token) })
      .update({ expires_at: new Date(Date.now() - 60 * 1000) });

    const res = await request(app)
      .post("/admin/auth/refresh")
      .send({ refresh_token: pair.refresh_token });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("admin_session_expired");
  });
});

describe("requireAdmin role and queue gating", () => {
  function run(mw: ReturnType<typeof requireAdmin>, req: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve) => {
      mw(req as never, {} as never, (err?: unknown) => resolve(err));
    });
  }

  it("a reviewer is refused a finance-only route, but a super passes", async () => {
    const reviewer = await makeAdmin("admin_reviewer", ["vehicles"]);
    const rv = await signIn(reviewer.email);
    const superAdmin = await makeAdmin("admin_super");
    const sv = await signIn(superAdmin.email);

    const financeOnly = requireAdmin({ role: "admin_finance" });

    const reviewerReq = {
      header: (h: string) => (h === "Authorization" ? `Bearer ${rv.access_token}` : undefined),
    };
    const superReq = {
      header: (h: string) => (h === "Authorization" ? `Bearer ${sv.access_token}` : undefined),
    };

    const reviewerErr = (await run(financeOnly, reviewerReq)) as { status?: number; code?: string };
    expect(reviewerErr?.status).toBe(403);
    expect(reviewerErr?.code).toBe("insufficient_scope");

    const superErr = await run(financeOnly, superReq);
    expect(superErr).toBeUndefined();
  });

  it("a reviewer without the queue assigned is refused a queue-scoped route", async () => {
    const reviewer = await makeAdmin("admin_reviewer", ["merchants"]);
    const rv = await signIn(reviewer.email);
    const vehiclesQueue = requireAdmin({ role: "admin_reviewer", queue: "vehicles" });
    const req = {
      header: (h: string) => (h === "Authorization" ? `Bearer ${rv.access_token}` : undefined),
    };
    const err = (await run(vehiclesQueue, req)) as { status?: number; code?: string };
    expect(err?.status).toBe(403);
    expect(err?.code).toBe("insufficient_scope");
  });
});

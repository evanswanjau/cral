import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { smsAdapter, emailAdapter } from "../../../lib/adapters.js";

const app = createApp();

// Unique-per-run identifiers so this suite is safe to re-run against a
// persistent local database without unique-constraint collisions.
const suffix = ulid().slice(-8).toLowerCase();
const phone = `+2547${suffix.replace(/[^0-9]/g, "1").slice(0, 8)}`;
const email = `test-${suffix}@example.test`;
const password = "correct horse battery staple";

function extractCode(message: string): string {
  const match = message.match(/\b(\d{6})\b/);
  if (!match) throw new Error(`No 6-digit code found in message: ${message}`);
  return match[1] as string;
}

afterAll(async () => {
  await db("users").where({ phone }).delete();
  await db.destroy();
});

describe("identity — golden path", () => {
  it("registers, verifies phone, logs in, refreshes, and reads /me", async () => {
    const smsSpy = vi.spyOn(smsAdapter, "send");

    const registerRes = await request(app).post("/auth/register").send({
      full_name: "Test User",
      phone,
      email,
      password,
      role: "customer",
      accepted_terms_version: "2026-08-24",
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.next).toBe("verify_phone");
    expect(registerRes.body.user.phone).toBe(phone);

    // Duplicate registration is rejected without revealing which field collided.
    const dupeRes = await request(app).post("/auth/register").send({
      full_name: "Test User",
      phone,
      email,
      password,
      role: "customer",
      accepted_terms_version: "2026-08-24",
    });
    expect(dupeRes.status).toBe(409);
    expect(dupeRes.body.error.code).toBe("account_exists");

    const signupCode = extractCode(smsSpy.mock.calls[0]?.[0]?.body ?? "");

    const verifyRes = await request(app).post("/auth/otp/verify").send({
      identifier: phone,
      purpose: "signup",
      code: signupCode,
    });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.verified).toBe(true);

    const wrongLoginRes = await request(app)
      .post("/auth/login")
      .send({ identifier: phone, password: "wrong password entirely", device_id: "dev_test" });
    expect(wrongLoginRes.status).toBe(401);
    expect(wrongLoginRes.body.error.code).toBe("invalid_credentials");

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ identifier: phone, password, device_id: "dev_test" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.access_token).toBeTruthy();
    expect(loginRes.body.refresh_token).toBeTruthy();

    const meRes = await request(app)
      .get("/me")
      .set("Authorization", `Bearer ${loginRes.body.access_token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.phone).toBe(phone);
    expect(meRes.body.phone_verified).toBe(true);

    const sessionsRes = await request(app)
      .get("/auth/sessions")
      .set("Authorization", `Bearer ${loginRes.body.access_token}`);
    expect(sessionsRes.status).toBe(200);
    expect(sessionsRes.body.data).toHaveLength(1);
    expect(sessionsRes.body.data[0].is_current).toBe(true);

    const originalRefreshToken = loginRes.body.refresh_token;
    const refreshRes = await request(app)
      .post("/auth/token/refresh")
      .send({ refresh_token: originalRefreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.refresh_token).not.toBe(originalRefreshToken);

    // Reuse of the now-rotated-away token is a replay: the whole session dies.
    const replayRes = await request(app)
      .post("/auth/token/refresh")
      .send({ refresh_token: originalRefreshToken });
    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error.code).toBe("invalid_refresh_token");

    // ...and the *new* token, which should still be legitimate, is now dead too.
    const afterReplayRes = await request(app)
      .post("/auth/token/refresh")
      .send({ refresh_token: refreshRes.body.refresh_token });
    expect(afterReplayRes.status).toBe(401);

    smsSpy.mockRestore();
  });

  it("resets a forgotten password by SMS code and revokes every session", async () => {
    const smsSpy = vi.spyOn(smsAdapter, "send");
    const emailSpy = vi.spyOn(emailAdapter, "send");

    // Fresh login so there's an active session to prove gets revoked.
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ identifier: phone, password, device_id: "dev_test_2" });
    expect(loginRes.status).toBe(200);

    const forgotRes = await request(app).post("/auth/password/forgot").send({ identifier: phone });
    expect(forgotRes.status).toBe(202);
    expect(forgotRes.body.channel_hint).toBe("sms");

    const resetCode = extractCode(smsSpy.mock.calls.at(-1)?.[0]?.body ?? "");

    const checkRes = await request(app)
      .post("/auth/password/reset/check")
      .send({ phone, code: resetCode });
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.valid).toBe(true);

    const newPassword = "a totally different passphrase";
    const resetRes = await request(app)
      .post("/auth/password/reset")
      .send({ phone, code: resetCode, new_password: newPassword });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.sessions_revoked).toBeGreaterThanOrEqual(1);

    // Old password no longer works, new one does.
    const oldPasswordLogin = await request(app)
      .post("/auth/login")
      .send({ identifier: phone, password, device_id: "dev_test_3" });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await request(app)
      .post("/auth/login")
      .send({ identifier: phone, password: newPassword, device_id: "dev_test_3" });
    expect(newPasswordLogin.status).toBe(200);

    smsSpy.mockRestore();
    emailSpy.mockRestore();
  });

  it("locks the account after repeated failed logins", async () => {
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post("/auth/login")
        .send({ identifier: email, password: "definitely wrong", device_id: "dev_lockout" });
    }
    const lockedRes = await request(app)
      .post("/auth/login")
      .send({ identifier: email, password: "definitely wrong", device_id: "dev_lockout" });
    expect(lockedRes.status).toBe(423);
    expect(lockedRes.body.error.code).toBe("account_locked");
  });
});

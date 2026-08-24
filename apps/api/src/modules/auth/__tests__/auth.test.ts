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
const emailOnly = `email-first-${suffix}@example.test`;
const password = "correct horse battery staple";

function extractCode(message: string): string {
  const match = message.match(/\b(\d{6})\b/);
  if (!match) throw new Error(`No 6-digit code found in message: ${message}`);
  return match[1] as string;
}

function extractResetToken(message: string): string {
  return /token=([A-Za-z0-9_-]+)/.exec(message)?.[1] ?? "";
}

afterAll(async () => {
  await db("users").where({ phone }).orWhere({ email: emailOnly }).delete();
  await db.destroy();
});

describe("identity — email-first sign-up", () => {
  it("registers with email + password only, verifies by email code, then signs in", async () => {
    const emailSpy = vi.spyOn(emailAdapter, "send");

    // No full_name, no phone — the merchant portal's actual sign-up shape.
    const registerRes = await request(app)
      .post("/auth/register")
      .send({ email: emailOnly, password, role: "merchant", accepted_terms_version: "2026-08-24" });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.next).toBe("verify_email");

    // The code goes by email, since that's the only contact on file.
    const code = extractCode(emailSpy.mock.calls.at(-1)?.[0]?.text ?? "");
    const verifyRes = await request(app)
      .post("/auth/otp/verify")
      .send({ identifier: emailOnly, purpose: "signup", code });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.verified).toBe(true);

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ identifier: emailOnly, password, device_id: "dev_email_first" });
    expect(loginRes.status).toBe(200);

    // registration-state is what drives the "finish setting up" nag, so it
    // must report the deferred phone as outstanding.
    const stateRes = await request(app)
      .get("/auth/registration-state")
      .set("Authorization", `Bearer ${loginRes.body.access_token}`);
    expect(stateRes.status).toBe(200);
    expect(stateRes.body).toMatchObject({
      phone_present: false,
      full_name_present: false,
      email_verified: true,
      merchant_profile_required: true,
    });

    emailSpy.mockRestore();
  });

  it("resets an email-only account's password by emailed link, with no phone to text", async () => {
    const emailSpy = vi.spyOn(emailAdapter, "send");
    const smsSpy = vi.spyOn(smsAdapter, "send");

    const forgotRes = await request(app)
      .post("/auth/password/forgot")
      .send({ identifier: emailOnly });
    expect(forgotRes.status).toBe(202);
    // With no phone on the account, email is the only possible channel.
    expect(forgotRes.body.channel_hint).toBe("email");
    expect(smsSpy).not.toHaveBeenCalled();

    const link = emailSpy.mock.calls.at(-1)?.[0]?.text ?? "";
    const token = link.match(/token=([\w-]+)/)?.[1];
    expect(token).toBeTruthy();

    const checkRes = await request(app).post("/auth/password/reset/check").send({ token });
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.valid).toBe(true);

    const resetRes = await request(app)
      .post("/auth/password/reset")
      .send({ token, new_password: "an entirely different passphrase" });
    expect(resetRes.status).toBe(200);

    const loginRes = await request(app)
      .post("/auth/login")
      .send({
        identifier: emailOnly,
        password: "an entirely different passphrase",
        device_id: "dev_ef2",
      });
    expect(loginRes.status).toBe(200);

    emailSpy.mockRestore();
    smsSpy.mockRestore();
  });
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

  it("resets a forgotten password by emailed link and revokes every session", async () => {
    const smsSpy = vi.spyOn(smsAdapter, "send");
    const emailSpy = vi.spyOn(emailAdapter, "send");

    // Fresh login so there's an active session to prove gets revoked.
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ identifier: phone, password, device_id: "dev_test_2" });
    expect(loginRes.status).toBe(200);

    const smsCallsBefore = smsSpy.mock.calls.length;

    const forgotRes = await request(app).post("/auth/password/forgot").send({ identifier: email });
    expect(forgotRes.status).toBe(202);
    expect(forgotRes.body.channel_hint).toBe("email");

    // Reset never goes out by SMS — that channel is reserved for opt-in 2FA.
    expect(smsSpy.mock.calls.length).toBe(smsCallsBefore);

    const resetToken = extractResetToken(emailSpy.mock.calls.at(-1)?.[0]?.text ?? "");
    expect(resetToken).toBeTruthy();

    const checkRes = await request(app)
      .post("/auth/password/reset/check")
      .send({ token: resetToken });
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.valid).toBe(true);

    const newPassword = "a totally different passphrase";
    const resetRes = await request(app)
      .post("/auth/password/reset")
      .send({ token: resetToken, new_password: newPassword });
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

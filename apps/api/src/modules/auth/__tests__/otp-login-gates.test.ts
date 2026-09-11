import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { emailAdapter } from "../../../lib/adapters.js";

/**
 * Passwordless OTP login (`POST /auth/otp/verify` with `purpose: "login"`)
 * is primary authentication - a texted/emailed code stands in for the
 * password. It must therefore apply the same gates `POST /auth/login`
 * does before a session exists:
 *
 *   - a `suspended` account cannot sign in by any path;
 *   - a `deleted` account behaves as if it never existed;
 *   - an enrolled second factor is still owed - no tokens until
 *     `POST /auth/2fa/challenge` succeeds.
 *
 * Before 2026-09-10 this branch did none of that: it found the user and
 * minted a full token pair, so it was a way around account suspension and
 * around opt-in 2FA (a SIM swap on the account phone was a complete
 * bypass of the second factor). This file locks the parity down.
 */

const app = createApp();

function extractCode(message: string): string {
  const match = message.match(/\b(\d{6})\b/);
  if (!match) throw new Error(`No 6-digit code found in message: ${message}`);
  return match[1] as string;
}

// One trusted proxy hop, so the last X-Forwarded-For entry is what the
// IP-keyed rate-limit buckets (`register`, `otp_request`, `otp_verify`)
// hash on. A fresh address per test keeps each case independent of the
// others and of how many OTP requests the rest of the auth suite made.
let ipSeed = 0;
const uniqueIp = (): string => `203.0.113.${(ipSeed++ % 200) + 20}`;

const createdEmails: string[] = [];

/** Registers an email+password customer and verifies the signup code. */
async function registerCustomer(ip: string): Promise<{ email: string; password: string }> {
  const email = `otp-gate-${ulid().slice(-10).toLowerCase()}@example.test`;
  const password = "correct horse battery staple";
  createdEmails.push(email);

  const emailSpy = vi.spyOn(emailAdapter, "send");
  await request(app)
    .post("/auth/register")
    .set("X-Forwarded-For", ip)
    .send({ email, password, role: "customer", accepted_terms_version: "2026-08-24" });
  const signupCode = extractCode(emailSpy.mock.calls.at(-1)?.[0]?.text ?? "");
  emailSpy.mockRestore();

  await request(app)
    .post("/auth/otp/verify")
    .set("X-Forwarded-For", ip)
    .send({ identifier: email, purpose: "signup", code: signupCode });

  return { email, password };
}

/** Drives `/auth/otp/request` + returns the emailed login code. */
async function requestLoginCode(email: string, ip: string): Promise<string> {
  const emailSpy = vi.spyOn(emailAdapter, "send");
  const res = await request(app)
    .post("/auth/otp/request")
    .set("X-Forwarded-For", ip)
    .send({ identifier: email, purpose: "login" });
  expect(res.status).toBe(200);
  const code = extractCode(emailSpy.mock.calls.at(-1)?.[0]?.text ?? "");
  emailSpy.mockRestore();
  return code;
}

/** POST /auth/otp/verify with purpose "login". */
async function otpLogin(email: string, code: string, ip: string) {
  return request(app)
    .post("/auth/otp/verify")
    .set("X-Forwarded-For", ip)
    .send({ identifier: email, purpose: "login", code });
}

afterAll(async () => {
  if (createdEmails.length > 0) {
    await db("users").whereIn("email", createdEmails).delete();
  }
  await db.destroy();
});

describe("passwordless OTP login applies the same gates as password login", () => {
  it("still issues a token pair for a healthy account (regression)", async () => {
    const ip = uniqueIp();
    const { email } = await registerCustomer(ip);
    const code = await requestLoginCode(email, ip);

    const res = await otpLogin(email, code, ip);

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.next).toBeNull();
  });

  it("refuses a suspended account with 403 and no tokens", async () => {
    const ip = uniqueIp();
    const { email } = await registerCustomer(ip);
    await db("users").where({ email }).update({ status: "suspended" });
    const code = await requestLoginCode(email, ip);

    const res = await otpLogin(email, code, ip);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("account_suspended");
    expect(res.body.access_token).toBeUndefined();
    expect(res.body.refresh_token).toBeUndefined();
  });

  it("treats a deleted account as unknown credentials, with no tokens", async () => {
    const ip = uniqueIp();
    const { email } = await registerCustomer(ip);
    await db("users").where({ email }).update({ status: "deleted" });
    const code = await requestLoginCode(email, ip);

    const res = await otpLogin(email, code, ip);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
    expect(res.body.access_token).toBeUndefined();
  });

  it("lets a pending_deletion account sign in (that is how it is undone)", async () => {
    const ip = uniqueIp();
    const { email } = await registerCustomer(ip);
    await db("users")
      .where({ email })
      .update({
        status: "pending_deletion",
        erasure_cooling_off_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    const code = await requestLoginCode(email, ip);

    const res = await otpLogin(email, code, ip);

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
  });

  it("stops at the 2FA challenge when a second factor is enrolled, issuing no tokens", async () => {
    const ip = uniqueIp();
    const { email } = await registerCustomer(ip);
    const digits = ulid().slice(-8).replace(/[^0-9]/g, "3").slice(0, 8);
    await db("users")
      .where({ email })
      .update({ two_factor_enabled: true, two_factor_phone: `+2547${digits}` });
    const code = await requestLoginCode(email, ip);

    const res = await otpLogin(email, code, ip);

    expect(res.status).toBe(200);
    expect(res.body.next).toBe("2fa");
    expect(res.body.challenge_id).toBeTruthy();
    expect(res.body.access_token).toBeUndefined();
    expect(res.body.refresh_token).toBeUndefined();
  });
});

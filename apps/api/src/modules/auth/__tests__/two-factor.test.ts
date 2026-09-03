import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { smsAdapter, emailAdapter } from "../../../lib/adapters.js";

const app = createApp();

const suffix = ulid().slice(-8).toLowerCase();
const digits = suffix.replace(/[^0-9]/g, "2").slice(0, 8);
const email = `twofa-${suffix}@example.test`;
const twoFactorPhone = `+2547${digits}`;
const password = "correct horse battery staple";

function extractCode(message: string): string {
  const match = message.match(/\b(\d{6})\b/);
  if (!match) throw new Error(`No 6-digit code found in message: ${message}`);
  return match[1] as string;
}

/** Registers a merchant, verifies the email, and returns a live access token. */
async function signUpAndSignIn(): Promise<string> {
  const emailSpy = vi.spyOn(emailAdapter, "send");
  await request(app)
    .post("/auth/register")
    .send({ email, password, role: "merchant", accepted_terms_version: "2026-08-24" });
  const code = extractCode(emailSpy.mock.calls.at(-1)?.[0]?.text ?? "");
  await request(app).post("/auth/otp/verify").send({ identifier: email, purpose: "signup", code });
  emailSpy.mockRestore();

  const loginRes = await request(app)
    .post("/auth/login")
    .send({ identifier: email, password, device_id: "dev_2fa_setup" });
  expect(loginRes.status).toBe(200);
  return loginRes.body.access_token as string;
}

let accessToken: string;

beforeAll(async () => {
  accessToken = await signUpAndSignIn();
});

afterAll(async () => {
  await db("users").where({ email }).delete(); // cascades to challenges + recovery codes
  await db.destroy();
});

describe("opt-in SMS two-factor", () => {
  it("is off by default, and login issues tokens straight away", async () => {
    const stateRes = await request(app)
      .get("/auth/2fa")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(stateRes.status).toBe(200);
    expect(stateRes.body).toMatchObject({ enabled: false, method: null });

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ identifier: email, password, device_id: "dev_no_2fa" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.access_token).toBeTruthy();
    expect(loginRes.body.next).toBeNull();
  });

  it("enrols in two steps (no recovery codes)", async () => {
    const smsSpy = vi.spyOn(smsAdapter, "send");

    const enrolRes = await request(app)
      .post("/auth/2fa/enroll")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ phone: twoFactorPhone });
    expect(enrolRes.status).toBe(200);
    expect(enrolRes.body.masked_destination).toContain("•");

    // Still off until the code comes back - holding the handset is the point.
    const midRes = await request(app)
      .get("/auth/2fa")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(midRes.body.enabled).toBe(false);

    const code = extractCode(smsSpy.mock.calls.at(-1)?.[0]?.body ?? "");
    const verifyRes = await request(app)
      .post("/auth/2fa/verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.recovery_codes).toBeUndefined();

    const afterRes = await request(app)
      .get("/auth/2fa")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(afterRes.body).toMatchObject({ enabled: true, method: "sms" });
    expect(afterRes.body.recovery_codes_remaining).toBeUndefined();

    smsSpy.mockRestore();
  });

  it("gates login behind a texted code, and issues no tokens until it's answered", async () => {
    const smsSpy = vi.spyOn(smsAdapter, "send");

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ identifier: email, password, device_id: "dev_2fa_login" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.next).toBe("2fa");
    expect(loginRes.body.challenge_id).toBeTruthy();
    // The whole point: a correct password alone buys nothing.
    expect(loginRes.body.access_token).toBeUndefined();
    expect(loginRes.body.refresh_token).toBeUndefined();

    const code = extractCode(smsSpy.mock.calls.at(-1)?.[0]?.body ?? "");

    const wrongRes = await request(app)
      .post("/auth/2fa/challenge")
      .send({ challenge_id: loginRes.body.challenge_id, code: "000000" });
    expect(wrongRes.status).toBe(401);
    expect(wrongRes.body.error.code).toBe("two_factor_invalid");

    const challengeRes = await request(app)
      .post("/auth/2fa/challenge")
      .send({ challenge_id: loginRes.body.challenge_id, code });
    expect(challengeRes.status).toBe(200);
    expect(challengeRes.body.access_token).toBeTruthy();
    expect(challengeRes.body.used_recovery_code).toBeUndefined();

    // Single use - the same code can't buy a second session.
    const replayRes = await request(app)
      .post("/auth/2fa/challenge")
      .send({ challenge_id: loginRes.body.challenge_id, code });
    expect(replayRes.status).toBe(400);

    smsSpy.mockRestore();
  });

  it("emails the code as a fallback when the text isn't arriving", async () => {
    const emailSpy = vi.spyOn(emailAdapter, "send");

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ identifier: email, password, device_id: "dev_email_fallback" });
    expect(loginRes.body.next).toBe("2fa");

    const resendRes = await request(app)
      .post("/auth/2fa/challenge/resend")
      .send({ challenge_id: loginRes.body.challenge_id, channel: "email" });
    expect(resendRes.status).toBe(200);
    expect(resendRes.body.channel).toBe("email");
    expect(resendRes.body.challenge_id).toBeTruthy();
    // The new code went to the account email, and the old challenge is retired.
    const emailedCode = extractCode(emailSpy.mock.calls.at(-1)?.[0]?.text ?? "");
    expect(emailSpy.mock.calls.at(-1)?.[0]?.subject).toBe("Your CRAL sign-in code");

    const oldRes = await request(app)
      .post("/auth/2fa/challenge")
      .send({ challenge_id: loginRes.body.challenge_id, code: emailedCode });
    expect(oldRes.status).toBe(400); // superseded

    const challengeRes = await request(app)
      .post("/auth/2fa/challenge")
      .send({ challenge_id: resendRes.body.challenge_id, code: emailedCode });
    expect(challengeRes.status).toBe(200);
    expect(challengeRes.body.access_token).toBeTruthy();

    emailSpy.mockRestore();
  });

  it("switches off with the password (a texted code is still accepted)", async () => {
    const smsSpy = vi.spyOn(smsAdapter, "send");

    const sendRes = await request(app)
      .post("/auth/2fa/challenge/send")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(sendRes.status).toBe(200);
    const code = extractCode(smsSpy.mock.calls.at(-1)?.[0]?.body ?? "");

    const wrongPasswordRes = await request(app)
      .delete("/auth/2fa")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ password: "not the password", code });
    expect(wrongPasswordRes.status).toBe(401);
    expect(wrongPasswordRes.body.error.code).toBe("invalid_credentials");

    const disableRes = await request(app)
      .delete("/auth/2fa")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ password, code });
    expect(disableRes.status).toBe(204);

    const stateRes = await request(app)
      .get("/auth/2fa")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(stateRes.body).toMatchObject({
      enabled: false,
      method: null,
      masked_destination: null,
    });

    // Back to a plain password login.
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ identifier: email, password, device_id: "dev_after_disable" });
    expect(loginRes.body.access_token).toBeTruthy();
    expect(loginRes.body.next).toBeNull();

    smsSpy.mockRestore();
  });

  it("never sends SMS for a password reset, even with 2FA enrolled", async () => {
    const smsSpy = vi.spyOn(smsAdapter, "send");
    const before = smsSpy.mock.calls.length;

    const forgotRes = await request(app).post("/auth/password/forgot").send({ identifier: email });
    expect(forgotRes.status).toBe(202);
    expect(forgotRes.body.channel_hint).toBe("email");
    expect(smsSpy.mock.calls.length).toBe(before);

    smsSpy.mockRestore();
  });
});

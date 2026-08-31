import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ulid } from "ulid";
import { createApp } from "../../../app.js";
import { db } from "../../../db/client.js";
import { smsAdapter, emailAdapter } from "../../../lib/adapters.js";

const app = createApp();

const suffix = ulid().slice(-8).toLowerCase();
const digits = suffix.replace(/[^0-9]/g, "3").slice(0, 8);
const email = `phoneverify-${suffix}@example.test`;
const phone = `+2547${digits}`;
const password = "correct horse battery staple";

function extractCode(message: string): string {
  const match = message.match(/\b(\d{6})\b/);
  if (!match) throw new Error(`No 6-digit code in: ${message}`);
  return match[1] as string;
}

let accessToken: string;

beforeAll(async () => {
  const emailSpy = vi.spyOn(emailAdapter, "send");
  await request(app)
    .post("/auth/register")
    .send({ email, password, role: "merchant", accepted_terms_version: "2026-08-24" });
  const code = extractCode(emailSpy.mock.calls.at(-1)?.[0]?.text ?? "");
  await request(app).post("/auth/otp/verify").send({ identifier: email, purpose: "signup", code });
  emailSpy.mockRestore();

  const loginRes = await request(app)
    .post("/auth/login")
    .send({ identifier: email, password, device_id: "dev_phone_verify" });
  accessToken = loginRes.body.access_token as string;
});

afterAll(async () => {
  await db("users").where({ email }).delete();
  await db.destroy();
});

const bearer = () => ({ Authorization: `Bearer ${accessToken}` });

describe("onboarding phone verification", () => {
  it("won't start until a phone is on file", async () => {
    const res = await request(app).post("/auth/phone/verification/start").set(bearer());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("phone_missing");
  });

  it("texts a code and flips phone_verified once it's confirmed", async () => {
    await request(app).patch("/merchant/onboarding").set(bearer()).send({ phone });

    const smsSpy = vi.spyOn(smsAdapter, "send");
    const startRes = await request(app).post("/auth/phone/verification/start").set(bearer());
    expect(startRes.status).toBe(200);
    expect(startRes.body.masked_destination).toContain("•");

    const code = extractCode(smsSpy.mock.calls.at(-1)?.[0]?.body ?? "");
    smsSpy.mockRestore();

    const wrong = await request(app)
      .post("/auth/phone/verification/confirm")
      .set(bearer())
      .send({ code: "000000" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("otp_incorrect");

    const ok = await request(app)
      .post("/auth/phone/verification/confirm")
      .set(bearer())
      .send({ code });
    expect(ok.status).toBe(200);
    expect(ok.body.phone_verified).toBe(true);

    const state = await request(app).get("/auth/registration-state").set(bearer());
    expect(state.body.phone_verified).toBe(true);

    const onboarding = await request(app).get("/merchant/onboarding").set(bearer());
    expect(onboarding.body.phone_verified).toBe(true);
  });

  it("is idempotent once verified", async () => {
    const res = await request(app).post("/auth/phone/verification/confirm").set(bearer()).send({ code: "123456" });
    expect(res.status).toBe(200);
    expect(res.body.phone_verified).toBe(true);
  });
});

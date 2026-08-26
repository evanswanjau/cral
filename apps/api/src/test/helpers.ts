import { ulid } from "ulid";
import { db } from "../db/client.js";
import { generateId } from "../lib/ids.js";
import { hashPassword } from "../lib/password.js";
import { signAccessToken } from "../lib/jwt.js";

/**
 * Inserts a fully-verified merchant user directly (skipping the
 * register/OTP/login dance) and returns a ready-to-use access token, so
 * every merchant-module test doesn't have to repeat that boilerplate.
 */
export async function createVerifiedTestUser(): Promise<{
  userId: string;
  email: string;
  accessToken: string;
}> {
  const suffix = ulid().slice(-10).toLowerCase();
  const email = `merchant-test-${suffix}@example.test`;

  const [user] = await db("users")
    .insert({
      id: generateId("user"),
      email,
      password_hash: await hashPassword("correct horse battery staple"),
      roles: ["merchant"],
      email_verified: true,
      terms_accepted_version: "2026-08-24",
      terms_accepted_at: new Date(),
    })
    .returning("*");
  if (!user) throw new Error("Failed to create test user");

  const [session] = await db("sessions")
    .insert({
      id: generateId("session"),
      user_id: user.id,
      device_id: "test-device",
      // token_hash is unique — a real per-test value, even though nothing
      // ever presents it (these tests use the access token directly).
      token_hash: `unused-${ulid()}`,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      last_seen_at: new Date(),
    })
    .returning("*");
  if (!session) throw new Error("Failed to create test session");

  const accessToken = signAccessToken({ sub: user.id, sid: session.id, roles: user.roles });
  return { userId: user.id, email, accessToken };
}

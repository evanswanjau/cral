import { ulid } from "ulid";
import { db } from "../db/client.js";
import type { AllowedUploadMimeType } from "../lib/uploads.js";
import { generateId } from "../lib/ids.js";
import { hashPassword } from "../lib/password.js";
import { signAccessToken, signAdminAccessToken, type AdminRole } from "../lib/jwt.js";

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

/**
 * Inserts an admin (Ops) user + a live `admin_sessions` row and returns a
 * ready-to-use ops-audience token, skipping the login → SMS-2FA dance.
 * `require-admin.ts` checks the session row exists and isn't idle-expired,
 * so a fabricated token alone won't do.
 */
export async function createTestAdmin(
  role: AdminRole = "admin_super",
  queues: string[] = [],
): Promise<{ adminId: string; email: string; token: string }> {
  const suffix = ulid().slice(-10).toLowerCase();
  const email = `ops-test-${suffix}@example.test`;
  const digits = suffix.replace(/[^0-9]/g, "4").slice(0, 8);

  const [admin] = await db("admin_users")
    .insert({
      id: generateId("adminUser"),
      email,
      password_hash: await hashPassword("unused in these tests"),
      phone: `+2547${digits}`,
      full_name: "Test Reviewer",
      role,
      assigned_queues: queues,
    })
    .returning("*");
  if (!admin) throw new Error("Failed to create test admin");

  const [session] = await db("admin_sessions")
    .insert({
      id: generateId("adminSession"),
      admin_user_id: admin.id,
      device_id: "test-device",
      token_hash: `unused-${ulid()}`,
      expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000),
      last_seen_at: new Date(),
    })
    .returning("*");
  if (!session) throw new Error("Failed to create test admin session");

  const token = signAdminAccessToken({ sub: admin.id, sid: session.id, role });
  return { adminId: admin.id, email, token };
}

/**
 * Minimal but genuine file bytes for upload tests.
 *
 * These used to be `Buffer.from("fake logbook")` labelled
 * `application/pdf`. Since the 2026-09-03 security patch the upload routes
 * check the leading bytes against the declared type
 * (`lib/uploads.ts#assertDeclaredTypeMatchesBytes`), so a test payload has
 * to actually be the thing it says it is — which is the point: a
 * `Content-Type` header is a claim, not evidence.
 *
 * `label` is appended after the signature so each fixture is still
 * distinguishable in an assertion, the way the old string payloads were.
 */
const FILE_SIGNATURES: Record<AllowedUploadMimeType, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34], // %PDF-1.4
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/webp": [
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ],
};

export function testFile(mimetype: AllowedUploadMimeType, label = ""): Buffer {
  return Buffer.concat([Buffer.from(FILE_SIGNATURES[mimetype]), Buffer.from(label, "utf8")]);
}

/** Shorthand for the two types the upload tests actually use. */
export const testPdf = (label = ""): Buffer => testFile("application/pdf", label);
export const testJpeg = (label = ""): Buffer => testFile("image/jpeg", label);

/**
 * A merchant (owned by a fresh verified user) with one live vehicle, and a
 * confirmed booking on it for `hirerId`. `bookings.merchant_id` and
 * `.vehicle_id` are real foreign keys, so money tests need real rows
 * behind them. Push the returned ids onto your own cleanup lists.
 */
export async function createTestBooking(
  hirerId: string,
  overrides: Record<string, unknown> = {},
  merchantOverrides: Record<string, unknown> = {},
): Promise<{ bookingId: string; merchantId: string; vehicleId: string; ownerUserId: string }> {
  const owner = await createVerifiedTestUser();
  const merchantId = generateId("merchant");
  await db("merchants").insert({
    id: merchantId,
    user_id: owner.userId,
    owner_type: "individual",
    first_name: "Test",
    surname: "Merchant",
    payout_method: "mpesa",
    payout_same: true,
    onboarding_step: 5,
    onboarding_max_step: 5,
    onboarding_screen: "done",
    onboarding_submitted: true,
    approved_at: new Date(),
    ...merchantOverrides,
  });

  const vehicleId = generateId("vehicle");
  await db("vehicles").insert({
    id: vehicleId,
    merchant_id: merchantId,
    type: "sedan",
    make: "Toyota",
    model: "Axio",
    year: "2019",
    registration: `KT${ulid().slice(-6)}`,
    transmission: "Automatic",
    fuel: "Petrol",
    seats: 5,
    county: "Nairobi",
    daily_rate_amount: 500_000,
    daily_rate_currency: "KES",
    minimum_hire_days: 1,
    chauffeured: false,
    status: "live",
  });

  const bookingId = generateId("booking");
  await db("bookings").insert({
    id: bookingId,
    ref: `CB-TEST-${bookingId.slice(-6)}`,
    merchant_id: merchantId,
    vehicle_id: vehicleId,
    hirer_id: hirerId,
    status: "confirmed",
    pickup_at: new Date(),
    dropoff_at: new Date(Date.now() + 86_400_000),
    pickup_location: "Nairobi",
    dropoff_location: "Nairobi",
    gross_amount: 500_000,
    gross_currency: "KES",
    commission_amount: 50_000,
    commission_currency: "KES",
    merchant_net_amount: 450_000,
    merchant_net_currency: "KES",
    deposit_amount: 75_000,
    deposit_currency: "KES",
    payout_method: "mpesa",
    payout_detail: "0700000000",
    payout_account_name: "Test Merchant",
    has_pickup_condition_photos: false,
    deposit_released: false,
    ...overrides,
  });

  return { bookingId, merchantId, vehicleId, ownerUserId: owner.userId };
}

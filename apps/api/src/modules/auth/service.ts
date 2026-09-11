import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signAccessToken, ACCESS_TOKEN_TTL_SECONDS } from "../../lib/jwt.js";
import { generateOtpCode, hashCode } from "../../lib/otp.js";
import { generateOpaqueToken, hashToken } from "../../lib/tokens.js";
import { isPasswordBreached } from "../../lib/breach-check.js";
import { isPhone, normalizePhone } from "../../lib/identifier.js";
import { maskIdentifier } from "../../lib/mask.js";
import { smsAdapter, emailAdapter } from "../../lib/adapters.js";
import {
  emailButton,
  emailCode,
  emailHeading,
  emailLayout,
  emailMuted,
  emailParagraph,
} from "../../lib/email-templates.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { getRenterVerification } from "../customer-account/service.js";
import type {
  OtpCodeRow,
  PasswordResetTokenRow,
  SessionRow,
  TwoFactorChallengeRow,
  UserRow,
} from "./db-types.js";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TOKEN_TTL_MINUTES = 30;
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_MINUTES = 15;
const TWO_FACTOR_TTL_MINUTES = 10;
const TWO_FACTOR_MAX_ATTEMPTS = 5;

/**
 * Where the reset link points. The merchant portal is a separate static
 * site from the API, so its origin has to be configured, not guessed —
 * localhost in dev, the deployed origin in staging/production. Trailing
 * slashes are trimmed so the path concatenation below can't double up.
 */
function merchantAppUrl(): string {
  return (process.env.MERCHANT_APP_URL ?? "http://localhost:5174").replace(/\/+$/, "");
}

type OtpPurpose =
  | "signup"
  | "login"
  | "phone_change"
  | "phone_verify"
  | "password_reset"
  | "two_factor_enrol";

export interface RequestContext {
  ip: string | null;
  requestId: string | null;
}

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

function resolveIdentifier(raw: string): { identifier: string; kind: "phone" | "email" } | null {
  if (raw.includes("@")) return { identifier: raw.trim().toLowerCase(), kind: "email" };
  const normalized = normalizePhone(raw);
  return normalized ? { identifier: normalized, kind: "phone" } : null;
}

async function findUserByIdentifier(raw: string): Promise<UserRow | undefined> {
  const resolved = resolveIdentifier(raw);
  if (!resolved) return undefined;
  return db<UserRow>("users")
    .where(
      resolved.kind === "phone" ? { phone: resolved.identifier } : { email: resolved.identifier },
    )
    .first();
}

function serializeUser(user: UserRow) {
  return {
    id: user.id,
    full_name: user.full_name,
    phone: user.phone,
    email: user.email,
    roles: user.roles,
    phone_verified: user.phone_verified,
    email_verified: user.email_verified,
  };
}

async function createSession(
  userId: string,
  deviceId: string,
  ctx: RequestContext,
): Promise<{ session: SessionRow; refreshToken: string }> {
  const refreshToken = generateOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [session] = await db<SessionRow>("sessions")
    .insert({
      id: generateId("session"),
      user_id: userId,
      device_id: deviceId,
      ip: ctx.ip,
      token_hash: hashToken(refreshToken),
      expires_at: expiresAt,
      last_seen_at: now,
    })
    .returning("*");

  if (!session) throw new Error("Failed to create session");
  return { session, refreshToken };
}

function issueTokenPair(user: UserRow, session: SessionRow, refreshToken: string) {
  const accessToken = signAccessToken({ sub: user.id, sid: session.id, roles: user.roles });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
  };
}

async function sendOtp(
  identifier: string,
  kind: "phone" | "email",
  purpose: OtpPurpose,
): Promise<void> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await db<OtpCodeRow>("otp_codes").insert({
    id: generateId("otpCode"),
    identifier,
    purpose,
    code_hash: hashCode(code),
    expires_at: expiresAt,
  });

  const body = `Your CRAL code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`;
  try {
    if (kind === "phone") {
      await smsAdapter.send({ to: identifier, body });
    } else {
      await emailAdapter.send({
        to: identifier,
        subject: "Your CRAL code",
        html: emailLayout({
          preheader: `${code} is your CRAL code`,
          bodyHtml: [
            emailHeading("Your verification code"),
            emailCode(code),
            emailParagraph(`Enter this to continue. It expires in ${OTP_TTL_MINUTES} minutes.`),
            emailMuted("If you didn't ask for this code, you can ignore this email."),
          ].join(""),
        }),
        text: body,
      });
    }
  } catch (err) {
    // A provider-side failure (no SMS credits, provider down, a number the
    // provider itself rejects) is not our bug — surface it as a clean,
    // retryable error rather than a bare 500. Callers that can tolerate a
    // silent miss (signup) already wrap this in their own .catch.
    console.error(`[auth] ${kind} OTP delivery to ${maskIdentifier(identifier)} failed:`, err);
    throw new ApiError({
      status: 503,
      type: "server_error",
      code: kind === "phone" ? "sms_send_failed" : "email_send_failed",
      message:
        kind === "phone"
          ? "We couldn't send the code by SMS just now. Please try again in a moment."
          : "We couldn't send the email just now. Please try again in a moment.",
    });
  }
}

// ---------------------------------------------------------------------
// §4 Registration and verification
// ---------------------------------------------------------------------

export interface RegisterInput {
  email: string;
  password: string;
  role: "customer" | "merchant";
  accepted_terms_version: string;
  /**
   * Optional at sign-up. The merchant portal collects both during
   * onboarding — the phone at payout setup, where the reason for asking is
   * self-evident — rather than putting an SMS wall in front of the signup
   * form. See the 20260826090000 migration for the recorded §4 deviation.
   */
  full_name?: string | undefined;
  phone?: string | undefined;
}

export async function register(input: RegisterInput, ctx: RequestContext) {
  const email = input.email.trim().toLowerCase();

  let phone: string | null = null;
  if (input.phone) {
    phone = normalizePhone(input.phone);
    if (!phone) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "invalid_phone",
        message: "That doesn't look like a valid phone number.",
        field: "phone",
      });
    }
  }

  const existing = await db<UserRow>("users")
    .where({ email })
    .modify((q) => {
      if (phone) q.orWhere({ phone });
    })
    .first();
  if (existing) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "account_exists",
      message: "An account with this phone or email already exists.",
    });
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  const [user] = await db<UserRow>("users")
    .insert({
      id: generateId("user"),
      full_name: input.full_name ?? null,
      phone,
      email,
      password_hash: passwordHash,
      roles: [input.role],
      terms_accepted_version: input.accepted_terms_version,
      terms_accepted_at: now,
      terms_accepted_ip: ctx.ip,
    })
    .returning("*");
  if (!user) throw new Error("Failed to create user");

  // Verify whichever contact we actually hold. Email-first sign-up sends the
  // code by email; a caller that did supply a phone keeps the SMS path.
  //
  // The account row above is already committed by this point, so a failed
  // send here must not fail the request — that would leave a real,
  // unverified account stranded with no way for the caller to know it
  // exists, since a retry just hits account_exists (409) against a row it
  // can't see. Log and continue instead; POST /auth/otp/request already
  // exists as the resend path once the underlying delivery problem (SMTP
  // down, SMS provider down, ...) is fixed.
  if (phone) {
    await sendOtp(phone, "phone", "signup").catch((err: unknown) => {
      console.error(`[auth] signup SMS to ${maskIdentifier(phone as string)} failed:`, err);
    });
    return { user: serializeUser(user), next: "verify_phone" as const };
  }
  await sendOtp(email, "email", "signup").catch((err: unknown) => {
    console.error(`[auth] signup email to ${maskIdentifier(email)} failed:`, err);
  });
  return { user: serializeUser(user), next: "verify_email" as const };
}

/**
 * What is still outstanding before this account can transact (spec §4).
 * Drives the portals' "finish setting up" banners — and, with email-first
 * sign-up, it is what tells the merchant portal the phone is still missing.
 */
export async function getRegistrationState(userId: string) {
  const user = await db<UserRow>("users").where({ id: userId }).first();
  if (!user) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "user_not_found",
      message: "Not found.",
    });
  }
  const isMerchant = user.roles.includes("merchant");
  return {
    full_name_present: user.full_name !== null,
    phone_present: user.phone !== null,
    phone_verified: user.phone_verified,
    email_verified: user.email_verified,
    terms_accepted: user.terms_accepted_version !== null,
    // Filled in by later phases; merchants need a phone on file before a
    // listing can go live, which is where the deferred number gets chased.
    merchant_profile_required: isMerchant,
    merchant_profile_present: false,
    // A renter needs their ID + driving licence accepted before booking.
    renter_verification: await getRenterVerification(userId),
  };
}

export async function requestOtp(identifier: string, purpose: OtpPurpose) {
  const resolved = resolveIdentifier(identifier);
  if (!resolved) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "invalid_identifier",
      message: "That doesn't look like a valid phone number or email.",
      field: "identifier",
    });
  }

  await sendOtp(resolved.identifier, resolved.kind, purpose);

  return { retry_after: 60, masked_destination: maskIdentifier(resolved.identifier) };
}

export interface VerifyOtpInput {
  identifier: string;
  purpose: OtpPurpose;
  code: string;
  deviceId?: string;
}

export async function verifyOtp(input: VerifyOtpInput, ctx: RequestContext) {
  const resolved = resolveIdentifier(input.identifier);
  if (!resolved) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "invalid_identifier",
      message: "That doesn't look like a valid phone number or email.",
      field: "identifier",
    });
  }

  const otp = await db<OtpCodeRow>("otp_codes")
    .where({ identifier: resolved.identifier, purpose: input.purpose, consumed_at: null })
    .orderBy("created_at", "desc")
    .first();

  if (!otp || otp.expires_at < new Date() || otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError({
      status: 410,
      type: "conflict",
      code: "otp_expired",
      message: "This code has expired. Request a new one.",
    });
  }

  if (hashCode(input.code) !== otp.code_hash) {
    await db<OtpCodeRow>("otp_codes")
      .where({ id: otp.id })
      .update({ attempts: otp.attempts + 1 });
    throw new ApiError({
      status: 401,
      type: "auth_error",
      code: "otp_incorrect",
      message: "That code is incorrect.",
    });
  }

  await db<OtpCodeRow>("otp_codes").where({ id: otp.id }).update({ consumed_at: new Date() });

  if (input.purpose === "signup") {
    const column = resolved.kind === "phone" ? "phone_verified" : "email_verified";
    await db<UserRow>("users")
      .where(
        resolved.kind === "phone" ? { phone: resolved.identifier } : { email: resolved.identifier },
      )
      .update({ [column]: true });
    return { verified: true };
  }

  if (input.purpose === "login") {
    const user = await findUserByIdentifier(resolved.identifier);
    if (!user) {
      throw new ApiError({
        status: 401,
        type: "auth_error",
        code: "invalid_credentials",
        message: "We couldn't find an account for that number or email.",
      });
    }

    // A texted code is primary authentication here, so the same gates as
    // password `login` apply before any session exists — otherwise this
    // branch is a way around account suspension and opt-in 2FA. A
    // suspended account can't sign in by any path; a deleted one behaves
    // as if it never existed; `pending_deletion` still signs in (that's
    // how "Keep my account" is reached inside the 30 days).
    if (user.status === "suspended") {
      throw new ApiError({
        status: 403,
        type: "auth_error",
        code: "account_suspended",
        message: "This account is suspended. Contact CRAL support.",
      });
    }
    if (user.status === "deleted") {
      throw new ApiError({
        status: 401,
        type: "auth_error",
        code: "invalid_credentials",
        message: "We couldn't find an account for that number or email.",
      });
    }

    // An enrolled second factor is still owed. No session and no tokens
    // exist until POST /auth/2fa/challenge succeeds — the texted login
    // code proved the account phone, the challenge proves the separate
    // `two_factor_phone`. Same shape `login` returns.
    if (user.two_factor_enabled && user.two_factor_phone) {
      const challenge = await issueTwoFactorChallenge(user, input.deviceId ?? "otp-login");
      return {
        next: "2fa" as const,
        challenge_id: challenge.id,
        masked_destination: maskIdentifier(user.two_factor_phone),
        expires_in: TWO_FACTOR_TTL_MINUTES * 60,
      };
    }

    const { session, refreshToken } = await createSession(
      user.id,
      input.deviceId ?? "otp-login",
      ctx,
    );
    return {
      ...issueTokenPair(user, session, refreshToken),
      user: serializeUser(user),
      next: null,
    };
  }

  return { verified: true };
}

// ---------------------------------------------------------------------
// Onboarding phone verification (owner's call, 2026-08-31)
//
// A one-time proof-of-ownership check on the payout number, required
// before a merchant can submit onboarding. Separate from opt-in 2FA:
// this verifies `users.phone` (the payout number, set in the wizard),
// 2FA uses its own `users.two_factor_phone`. Reuses the `otp_codes`
// table with its own purpose.
// ---------------------------------------------------------------------

export async function startPhoneVerification(userId: string) {
  const user = await requireUser(userId);
  if (!user.phone) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "phone_missing",
      message: "Add your phone number first.",
      field: "phone",
    });
  }
  if (user.phone_verified) {
    return { masked_destination: maskIdentifier(user.phone), already_verified: true as const };
  }
  await sendOtp(user.phone, "phone", "phone_verify");
  return { masked_destination: maskIdentifier(user.phone), retry_after: 60 };
}

export async function confirmPhoneVerification(userId: string, code: string, ctx: RequestContext) {
  const user = await requireUser(userId);
  if (!user.phone) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "phone_missing",
      message: "Add your phone number first.",
      field: "phone",
    });
  }
  if (user.phone_verified) return { phone_verified: true as const };

  const row = await db<OtpCodeRow>("otp_codes")
    .where({ identifier: user.phone, purpose: "phone_verify", consumed_at: null })
    .orderBy("created_at", "desc")
    .first();

  if (!row || row.expires_at < new Date() || row.attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError({
      status: 410,
      type: "conflict",
      code: "otp_expired",
      message: "That code has expired. Ask for a new one.",
    });
  }

  if (hashCode(code.trim()) !== row.code_hash) {
    await db<OtpCodeRow>("otp_codes").where({ id: row.id }).update({ attempts: row.attempts + 1 });
    throw new ApiError({
      status: 401,
      type: "auth_error",
      code: "otp_incorrect",
      message: "That code is incorrect.",
      field: "code",
    });
  }

  await db.transaction(async (trx) => {
    await trx<OtpCodeRow>("otp_codes").where({ id: row.id }).update({ consumed_at: new Date() });
    await trx<UserRow>("users").where({ id: user.id }).update({ phone_verified: true });
    await writeAuditEntry(trx, {
      actorId: user.id,
      actorType: "user",
      action: "auth.phone.verified",
      entityType: "user",
      entityId: user.id,
      after: { phone_verified: true },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  return { phone_verified: true as const };
}

// ---------------------------------------------------------------------
// §5 Login and sessions
// ---------------------------------------------------------------------

async function assertNotLocked(user: UserRow): Promise<void> {
  if (user.locked_until && user.locked_until > new Date()) {
    throw new ApiError({
      status: 423,
      type: "auth_error",
      code: "account_locked",
      message: "Too many failed attempts. Try again later or reset your password.",
    });
  }
}

async function registerFailedAttempt(user: UserRow): Promise<void> {
  const failedCount = user.failed_login_count + 1;
  const lockedUntil =
    failedCount >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
  await db<UserRow>("users")
    .where({ id: user.id })
    .update({ failed_login_count: failedCount, locked_until: lockedUntil });
}

export async function login(
  identifier: string,
  password: string,
  deviceId: string,
  ctx: RequestContext,
) {
  const user = await findUserByIdentifier(identifier);

  // Always run a hash comparison, even for an unknown identifier, so a
  // missing account and a wrong password take roughly the same time.
  const passwordHash =
    user?.password_hash ??
    "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const passwordOk = await verifyPassword(passwordHash, password).catch(() => false);

  if (!user) {
    throw new ApiError({
      status: 401,
      type: "auth_error",
      code: "invalid_credentials",
      message: "That phone or email and password do not match.",
    });
  }

  await assertNotLocked(user);

  if (!passwordOk) {
    await registerFailedAttempt(user);
    throw new ApiError({
      status: 401,
      type: "auth_error",
      code: "invalid_credentials",
      message: "That phone or email and password do not match.",
    });
  }

  // A suspended account can't sign in at all; a purged one behaves as if
  // it never existed. A `pending_deletion` account *can* still sign in —
  // that's how the merchant reaches "Keep my account" within the 30 days.
  if (user.status === "suspended") {
    throw new ApiError({
      status: 403,
      type: "auth_error",
      code: "account_suspended",
      message: "This account is suspended. Contact CRAL support.",
    });
  }
  if (user.status === "deleted") {
    throw new ApiError({
      status: 401,
      type: "auth_error",
      code: "invalid_credentials",
      message: "That phone or email and password do not match.",
    });
  }

  if (user.failed_login_count > 0 || user.locked_until) {
    await db<UserRow>("users")
      .where({ id: user.id })
      .update({ failed_login_count: 0, locked_until: null });
  }

  // The password was right, but an enrolled merchant still owes a code. No
  // session and no tokens exist until POST /auth/2fa/challenge succeeds.
  if (user.two_factor_enabled && user.two_factor_phone) {
    const challenge = await issueTwoFactorChallenge(user, deviceId);
    return {
      next: "2fa" as const,
      challenge_id: challenge.id,
      masked_destination: maskIdentifier(user.two_factor_phone),
      expires_in: TWO_FACTOR_TTL_MINUTES * 60,
    };
  }

  const { session, refreshToken } = await createSession(user.id, deviceId, ctx);
  return { ...issueTokenPair(user, session, refreshToken), user: serializeUser(user), next: null };
}

export async function refreshToken(presentedToken: string, ctx: RequestContext) {
  const presentedHash = hashToken(presentedToken);

  const byCurrentHash = await db<SessionRow>("sessions")
    .where({ token_hash: presentedHash })
    .first();

  if (byCurrentHash) {
    if (byCurrentHash.revoked_at || byCurrentHash.expires_at < new Date()) {
      throw new ApiError({
        status: 401,
        type: "auth_error",
        code: "invalid_refresh_token",
        message: "Please sign in again.",
      });
    }

    const user = await db<UserRow>("users").where({ id: byCurrentHash.user_id }).first();
    if (!user) {
      throw new ApiError({
        status: 401,
        type: "auth_error",
        code: "invalid_refresh_token",
        message: "Please sign in again.",
      });
    }

    // A suspended or deleted account can't extend its session - within one
    // refresh cycle its access token stops working everywhere (which
    // includes accepting bookings). Same rule as `login`.
    if (user.status === "suspended" || user.status === "deleted") {
      await db<SessionRow>("sessions")
        .where({ id: byCurrentHash.id })
        .update({ revoked_at: new Date(), revoked_reason: `account_${user.status}` });
      throw new ApiError({
        status: user.status === "suspended" ? 403 : 401,
        type: "auth_error",
        code: user.status === "suspended" ? "account_suspended" : "invalid_refresh_token",
        message:
          user.status === "suspended"
            ? "This account is suspended. Contact CRAL support."
            : "Please sign in again.",
      });
    }

    const newRefreshToken = generateOpaqueToken();
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await db<SessionRow>("sessions")
      .where({ id: byCurrentHash.id })
      .update({
        token_hash: hashToken(newRefreshToken),
        previous_token_hash: presentedHash,
        expires_at: newExpiresAt,
        last_seen_at: new Date(),
        ip: ctx.ip,
      });

    return issueTokenPair(user, byCurrentHash, newRefreshToken);
  }

  // Presented hash matches a *previous* (already-rotated) token — someone
  // is replaying a used refresh token. Revoke the whole session (spec §5).
  const reused = await db<SessionRow>("sessions")
    .where({ previous_token_hash: presentedHash })
    .first();
  if (reused && !reused.revoked_at) {
    await db<SessionRow>("sessions")
      .where({ id: reused.id })
      .update({ revoked_at: new Date(), revoked_reason: "reuse_detected" });
  }

  throw new ApiError({
    status: 401,
    type: "auth_error",
    code: "invalid_refresh_token",
    message: "Please sign in again.",
  });
}

export async function logout(
  userId: string,
  sessionId: string,
  allDevices: boolean,
): Promise<void> {
  const query = db<SessionRow>("sessions").where({ user_id: userId, revoked_at: null });
  if (!allDevices) query.andWhere({ id: sessionId });
  await query.update({ revoked_at: new Date(), revoked_reason: "logout" });
}

export async function listSessions(userId: string, currentSessionId: string) {
  const sessions = await db<SessionRow>("sessions")
    .where({ user_id: userId, revoked_at: null })
    .andWhere("expires_at", ">", new Date())
    .orderBy("last_seen_at", "desc");

  return sessions.map((s) => ({
    id: s.id,
    device: s.device_label ?? s.device_id,
    approximate_location: null,
    // Raw UA so the client can render the design's "CHROME MOBILE" line;
    // parsing it into a friendly label is a display concern.
    user_agent: s.user_agent ?? null,
    last_seen_at: s.last_seen_at.toISOString(),
    is_current: s.id === currentSessionId,
  }));
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const updated = await db<SessionRow>("sessions")
    .where({ id: sessionId, user_id: userId, revoked_at: null })
    .update({ revoked_at: new Date(), revoked_reason: "logout" });

  if (updated === 0) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "session_not_found",
      message: "That session doesn't exist or is already signed out.",
    });
  }
}

/**
 * "Sign out everywhere" — revokes every active session for the caller
 * except the one making the request. Returns how many were signed out so
 * the UI can confirm ("Signed out on 2 other devices").
 */
export async function revokeAllOtherSessions(
  userId: string,
  currentSessionId: string,
  ctx: RequestContext,
): Promise<{ revoked: number }> {
  const revoked = await db.transaction(async (trx) => {
    const n = await trx<SessionRow>("sessions")
      .where({ user_id: userId, revoked_at: null })
      .andWhereNot({ id: currentSessionId })
      .update({ revoked_at: new Date(), revoked_reason: "signed_out_everywhere" });

    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "user.sessions_revoked_all",
      entityType: "user",
      entityId: userId,
      after: { revoked: n },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return n;
  });

  return { revoked };
}

// ---------------------------------------------------------------------
// Self-service account deletion (owner's call, 2026-09-03)
//
// Requesting deletion flips the account to `pending_deletion` and sets a
// 30-day timer (reusing the Phase-0 `erasure_cooling_off_until` column).
// Every other session is revoked, so the account "seems deleted"
// everywhere — but the merchant can still sign in and hit "Keep my
// account" until the timer runs out. The daily sweep then scrubs PII and
// blocks sign-in for good, keeping bookings/payouts/audit rows so a hirer
// still sees where they booked.
// ---------------------------------------------------------------------

const DELETION_GRACE_DAYS = 30;

export async function requestAccountDeletion(
  userId: string,
  currentSessionId: string,
  ctx: RequestContext,
): Promise<{ status: string; deletion_scheduled_at: string }> {
  const user = await requireUser(userId);

  if (user.status === "deleted") {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "account_deleted",
      message: "This account has already been deleted.",
    });
  }

  // Idempotent — asking twice keeps the original schedule.
  if (user.status === "pending_deletion" && user.erasure_cooling_off_until) {
    return {
      status: "pending_deletion",
      deletion_scheduled_at: user.erasure_cooling_off_until.toISOString(),
    };
  }

  const scheduledAt = new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);

  await db.transaction(async (trx) => {
    await trx<UserRow>("users").where({ id: user.id }).update({
      status: "pending_deletion",
      status_changed_at: new Date(),
      erasure_requested: true,
      erasure_cooling_off_until: scheduledAt,
    });
    await trx<SessionRow>("sessions")
      .where({ user_id: user.id, revoked_at: null })
      .andWhereNot({ id: currentSessionId })
      .update({ revoked_at: new Date(), revoked_reason: "account_deletion_requested" });
    await writeAuditEntry(trx, {
      actorId: user.id,
      actorType: "user",
      action: "user.deletion_requested",
      entityType: "user",
      entityId: user.id,
      after: { deletion_scheduled_at: scheduledAt.toISOString() },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  const when = scheduledAt.toISOString().slice(0, 10);
  await emailAdapter.send({
    to: user.email,
    subject: "Your CRAL account is scheduled for deletion",
    html: emailLayout({
      preheader: `Scheduled for ${when}. Sign in and choose "Keep my account" to stop it.`,
      bodyHtml: [
        emailHeading("Account scheduled for deletion"),
        emailParagraph(
          `Your account and listings will be permanently deleted on ${when}. Bookings already running still finish and still pay out.`,
        ),
        emailParagraph(
          'Changed your mind? Sign in any time before then and choose "Keep my account".',
        ),
        emailMuted("If you didn't ask for this, sign in now and cancel it, then change your password."),
      ].join(""),
    }),
    text: `Your CRAL account is scheduled for deletion on ${when}. Sign in before then and choose "Keep my account" to stop it.`,
  });

  return { status: "pending_deletion", deletion_scheduled_at: scheduledAt.toISOString() };
}

export async function cancelAccountDeletion(
  userId: string,
  ctx: RequestContext,
): Promise<{ status: string }> {
  const user = await requireUser(userId);
  if (user.status !== "pending_deletion") {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "no_pending_deletion",
      message: "This account isn't scheduled for deletion.",
    });
  }

  await db.transaction(async (trx) => {
    await trx<UserRow>("users").where({ id: user.id }).update({
      status: "active",
      status_changed_at: new Date(),
      erasure_requested: false,
      erasure_cooling_off_until: null,
    });
    await writeAuditEntry(trx, {
      actorId: user.id,
      actorType: "user",
      action: "user.deletion_cancelled",
      entityType: "user",
      entityId: user.id,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  return { status: "active" };
}

/**
 * Run daily (folded into runDailyReminderSweep). Purges accounts whose
 * 30-day grace period has elapsed: scrub the PII on the user row and mark
 * it `deleted`, revoke every session, drop credentials/recovery codes.
 * Merchants, vehicles, bookings, payouts and audit_log are deliberately
 * left intact.
 */
export async function runAccountDeletionSweep(): Promise<{ purged: number }> {
  const due = await db<UserRow>("users")
    .where({ status: "pending_deletion" })
    .andWhere("erasure_cooling_off_until", "<=", new Date());

  let purged = 0;
  for (const user of due) {
    await db.transaction(async (trx) => {
      await trx<UserRow>("users").where({ id: user.id }).update({
        status: "deleted",
        status_changed_at: new Date(),
        erasure_requested: false,
        erasure_cooling_off_until: null,
        email: `deleted-${user.id}@cral.invalid`,
        phone: null,
        phone_verified: false,
        full_name: null,
        // Unusable hash — no valid password can produce it.
        password_hash: "deleted",
        two_factor_enabled: false,
        two_factor_phone: null,
        two_factor_enrolled_at: null,
        pin_hash: null,
      });
      await trx<SessionRow>("sessions")
        .where({ user_id: user.id, revoked_at: null })
        .update({ revoked_at: new Date(), revoked_reason: "account_deleted" });
      await trx("recovery_codes").where({ user_id: user.id }).del();
      await trx("password_reset_tokens").where({ user_id: user.id }).del();
      await writeAuditEntry(trx, {
        actorId: null,
        actorType: "system",
        action: "user.deleted",
        entityType: "user",
        entityId: user.id,
        after: { reason: "grace_period_elapsed" },
      });
    });
    purged++;
  }

  return { purged };
}

// ---------------------------------------------------------------------
// §7 Opt-in SMS two-factor
// ---------------------------------------------------------------------

export type TwoFactorChannel = "sms" | "email";

/**
 * Sends a fresh six-digit code and records the challenge it belongs to.
 * Any earlier unspent challenge for the same user is retired first, so a
 * second sign-in attempt can't be completed with a stale code.
 *
 * `channel` is normally "sms" (the enrolled number). "email" is the
 * fallback when the text isn't arriving - the code goes to the account
 * email instead. There are no recovery codes; email, then support, is the
 * whole fallback chain.
 */
async function issueTwoFactorChallenge(
  user: UserRow,
  deviceId: string,
  channel: TwoFactorChannel = "sms",
): Promise<TwoFactorChallengeRow> {
  await db<TwoFactorChallengeRow>("two_factor_challenges")
    .where({ user_id: user.id, consumed_at: null })
    .update({ consumed_at: new Date() });

  const code = generateOtpCode();
  const [challenge] = await db<TwoFactorChallengeRow>("two_factor_challenges")
    .insert({
      id: generateId("twoFactorChallenge"),
      user_id: user.id,
      device_id: deviceId,
      code_hash: hashCode(code),
      expires_at: new Date(Date.now() + TWO_FACTOR_TTL_MINUTES * 60 * 1000),
    })
    .returning("*");

  if (!challenge) throw new Error("Failed to create two-factor challenge");

  if (channel === "email") {
    await emailAdapter.send({
      to: user.email,
      subject: "Your CRAL sign-in code",
      html: emailLayout({
        preheader: `${code} - your CRAL sign-in code`,
        bodyHtml: [
          emailHeading("Your sign-in code"),
          emailParagraph(
            `Enter <strong>${code}</strong> to finish signing in. It expires in ${TWO_FACTOR_TTL_MINUTES} minutes.`,
          ),
          emailMuted("If you didn't try to sign in, change your password and contact support."),
        ].join(""),
      }),
      text: `${code} is your CRAL sign-in code. It expires in ${TWO_FACTOR_TTL_MINUTES} minutes.`,
    });
  } else {
    await smsAdapter.send({
      to: user.two_factor_phone as string,
      body: `${code} is your CRAL sign-in code. It expires in ${TWO_FACTOR_TTL_MINUTES} minutes.`,
    });
  }

  return challenge;
}

async function requireUser(userId: string): Promise<UserRow> {
  const user = await db<UserRow>("users").where({ id: userId }).first();
  if (!user) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "user_not_found",
      message: "That account no longer exists.",
    });
  }
  return user;
}

/**
 * Step 1 of enrolment: take the handset the merchant wants challenges on,
 * and text it a code to prove they hold it. Nothing is switched on until
 * /auth/2fa/verify confirms.
 */
export async function enroll2fa(userId: string, rawPhone: string) {
  const user = await requireUser(userId);

  if (user.two_factor_enabled) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "two_factor_already_enabled",
      message: "Two-factor authentication is already on for this account.",
    });
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "invalid_phone",
      message: "That doesn't look like a Kenyan mobile number.",
      field: "phone",
    });
  }

  await db<UserRow>("users").where({ id: user.id }).update({ two_factor_phone: phone });
  await sendOtp(phone, "phone", "two_factor_enrol");

  return { masked_destination: maskIdentifier(phone), retry_after: 60 };
}

/**
 * Step 2 of enrolment: the code from the text. Switches 2FA on. (Kept for
 * a future "use a different number" need; the Settings UI uses the
 * one-tap `enable2fa` instead. There are no recovery codes.)
 */
export async function verify2fa(userId: string, code: string, ctx: RequestContext) {
  const user = await requireUser(userId);

  if (user.two_factor_enabled) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "two_factor_already_enabled",
      message: "Two-factor authentication is already on for this account.",
    });
  }

  if (!user.two_factor_phone) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "two_factor_not_started",
      message: "Start by choosing the number to text.",
    });
  }

  const row = await db<OtpCodeRow>("otp_codes")
    .where({ identifier: user.two_factor_phone, purpose: "two_factor_enrol", consumed_at: null })
    .orderBy("created_at", "desc")
    .first();

  if (!row || row.expires_at < new Date() || row.attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError({
      status: 400,
      type: "conflict",
      code: "otp_expired",
      message: "That code has expired. Ask for a new one.",
    });
  }

  if (hashCode(code) !== row.code_hash) {
    await db<OtpCodeRow>("otp_codes")
      .where({ id: row.id })
      .update({ attempts: row.attempts + 1 });
    throw new ApiError({
      status: 400,
      type: "validation_error",
      code: "otp_invalid",
      message: "That code isn't right.",
      field: "code",
    });
  }

  await db.transaction(async (trx) => {
    await trx<OtpCodeRow>("otp_codes").where({ id: row.id }).update({ consumed_at: new Date() });
    await trx<UserRow>("users")
      .where({ id: user.id })
      .update({ two_factor_enabled: true, two_factor_enrolled_at: new Date() });
    await writeAuditEntry(trx, {
      actorId: user.id,
      actorType: "user",
      action: "auth.two_factor.enabled",
      entityType: "user",
      entityId: user.id,
      after: { two_factor_enabled: true },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  const notice =
    "Two-factor authentication was switched on for your CRAL account. If this wasn't you, contact support immediately.";
  await emailAdapter.send({
    to: user.email,
    subject: "Two-factor authentication is on",
    html: emailLayout({
      preheader: "Two-factor authentication is now on for your account",
      bodyHtml: [
        emailHeading("Two-factor authentication is on"),
        emailParagraph(
          "From now on, signing in needs your password and a code texted to your phone.",
        ),
        emailMuted("If this wasn't you, contact support immediately."),
      ].join(""),
    }),
    text: notice,
  });

  return { enabled: true };
}

/**
 * The one-tap switch (Settings → Security). The account phone has already
 * been proven at onboarding, so there is no handset step - enabling just
 * points the second factor at `users.phone`.
 *
 * There are no recovery codes (owner's call, 2026-09-04). If a text isn't
 * arriving, the sign-in screen can send the code by email instead; past
 * that, support. `enroll2fa` + `verify2fa` stay for a future "use a
 * different number" need, but the UI no longer walks that path.
 */
export async function enable2fa(userId: string, ctx: RequestContext) {
  const user = await requireUser(userId);

  if (user.two_factor_enabled) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "two_factor_already_enabled",
      message: "Two-factor authentication is already on for this account.",
    });
  }

  if (!user.phone || !user.phone_verified) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "phone_not_verified",
      message: "Verify your phone number first - see the My profile tab.",
    });
  }

  await db.transaction(async (trx) => {
    await trx<UserRow>("users").where({ id: user.id }).update({
      two_factor_phone: user.phone,
      two_factor_enabled: true,
      two_factor_enrolled_at: new Date(),
    });
    await writeAuditEntry(trx, {
      actorId: user.id,
      actorType: "user",
      action: "auth.two_factor.enabled",
      entityType: "user",
      entityId: user.id,
      after: { two_factor_enabled: true },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  await emailAdapter.send({
    to: user.email,
    subject: "Two-factor authentication is on",
    html: emailLayout({
      preheader: "Two-factor authentication is now on for your account",
      bodyHtml: [
        emailHeading("Two-factor authentication is on"),
        emailParagraph(
          "From now on, signing in needs your password and a code texted to your phone.",
        ),
        emailMuted("If this wasn't you, contact support immediately."),
      ].join(""),
    }),
    text: "Two-factor authentication was switched on for your CRAL account. If this wasn't you, contact support immediately.",
  });

  return { enabled: true };
}

/**
 * The post-password step at sign-in. Accepts the six-digit code (texted, or
 * emailed via the fallback) and only then creates the session. There are
 * no recovery codes.
 */
export async function completeTwoFactorChallenge(
  challengeId: string,
  presented: string,
  ctx: RequestContext,
) {
  const challenge = await db<TwoFactorChallengeRow>("two_factor_challenges")
    .where({ id: challengeId, consumed_at: null })
    .first();

  if (
    !challenge ||
    challenge.expires_at < new Date() ||
    challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS
  ) {
    throw new ApiError({
      status: 400,
      type: "conflict",
      code: "two_factor_challenge_expired",
      message: "That sign-in attempt has expired. Start again.",
    });
  }

  const user = await requireUser(challenge.user_id);

  const code = presented.trim();
  const matchesTexted = /^[0-9]{6}$/.test(code) && hashCode(code) === challenge.code_hash;

  if (!matchesTexted) {
    await db<TwoFactorChallengeRow>("two_factor_challenges")
      .where({ id: challenge.id })
      .update({ attempts: challenge.attempts + 1 });
    throw new ApiError({
      status: 401,
      type: "auth_error",
      code: "two_factor_invalid",
      message: "That code isn't right.",
      field: "code",
    });
  }

  await db<TwoFactorChallengeRow>("two_factor_challenges")
    .where({ id: challenge.id })
    .update({ consumed_at: new Date() });

  const { session, refreshToken } = await createSession(user.id, challenge.device_id, ctx);
  return {
    ...issueTokenPair(user, session, refreshToken),
    user: serializeUser(user),
    next: null,
  };
}

/**
 * Sign-in fallback: re-send the pending challenge's code, by SMS again or
 * by email. Unauthenticated - the caller has passed a password but holds
 * no token; the challenge id is the only thing identifying them.
 */
export async function resendTwoFactorChallenge(
  challengeId: string,
  channel: TwoFactorChannel,
) {
  const challenge = await db<TwoFactorChallengeRow>("two_factor_challenges")
    .where({ id: challengeId, consumed_at: null })
    .first();
  if (!challenge || challenge.expires_at < new Date()) {
    throw new ApiError({
      status: 400,
      type: "conflict",
      code: "two_factor_challenge_expired",
      message: "That sign-in attempt has expired. Start again.",
    });
  }
  const user = await requireUser(challenge.user_id);
  const fresh = await issueTwoFactorChallenge(user, challenge.device_id, channel);
  return {
    challenge_id: fresh.id,
    channel,
    masked_destination:
      channel === "email"
        ? maskIdentifier(user.email)
        : maskIdentifier(user.two_factor_phone ?? user.phone ?? ""),
    expires_in: TWO_FACTOR_TTL_MINUTES * 60,
  };
}

/**
 * Turning it off costs a password *and* a current code, per the contract.
 * The code must come from a challenge the caller already holds — call
 * /auth/2fa/challenge/send first — or be one of the recovery codes.
 */
export async function disable2fa(
  userId: string,
  password: string,
  code: string | undefined,
  ctx: RequestContext,
) {
  const user = await requireUser(userId);

  if (!user.two_factor_enabled) return;

  if (user.roles.includes("admin")) {
    throw new ApiError({
      status: 403,
      type: "auth_error",
      code: "admin_two_factor_required",
      message: "Admins can't switch off their own two-factor authentication.",
    });
  }

  const passwordOk = await verifyPassword(user.password_hash, password).catch(() => false);
  if (!passwordOk) {
    throw new ApiError({
      status: 401,
      type: "auth_error",
      code: "invalid_credentials",
      message: "That password isn't right.",
      field: "password",
    });
  }

  // The code is optional (the switch off asks for the password only -
  // texting yourself a code to stop texting yourself codes is circular
  // friction, and the caller is already in an authenticated session). When
  // a texted code *is* supplied it's still honoured/consumed.
  const trimmed = (code ?? "").trim();
  if (trimmed) {
    const challenge = await db<TwoFactorChallengeRow>("two_factor_challenges")
      .where({ user_id: user.id, consumed_at: null })
      .orderBy("created_at", "desc")
      .first();

    const matchesTexted =
      !!challenge &&
      challenge.expires_at > new Date() &&
      /^[0-9]{6}$/.test(trimmed) &&
      hashCode(trimmed) === challenge.code_hash;

    if (!matchesTexted) {
      throw new ApiError({
        status: 401,
        type: "auth_error",
        code: "two_factor_invalid",
        message: "That code isn't right.",
        field: "code",
      });
    }

    await db<TwoFactorChallengeRow>("two_factor_challenges")
      .where({ id: challenge!.id })
      .update({ consumed_at: new Date() });
  }

  await db.transaction(async (trx) => {
    await trx<UserRow>("users")
      .where({ id: user.id })
      .update({ two_factor_enabled: false, two_factor_phone: null, two_factor_enrolled_at: null });
    await writeAuditEntry(trx, {
      actorId: user.id,
      actorType: "user",
      action: "auth.two_factor.disabled",
      entityType: "user",
      entityId: user.id,
      before: { two_factor_enabled: true },
      after: { two_factor_enabled: false },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  const notice =
    "Two-factor authentication was switched off for your CRAL account. If this wasn't you, contact support immediately.";
  await emailAdapter.send({
    to: user.email,
    subject: "Two-factor authentication is off",
    html: emailLayout({
      preheader: "Two-factor authentication is now off for your account",
      bodyHtml: [
        emailHeading("Two-factor authentication is off"),
        emailParagraph("Signing in no longer asks for a texted code — a password is enough again."),
        emailMuted("If this wasn't you, contact support immediately."),
      ].join(""),
    }),
    text: notice,
  });
}

/** Raises a fresh challenge for an already-signed-in merchant. */
export async function sendTwoFactorChallenge(userId: string) {
  const user = await requireUser(userId);
  if (!user.two_factor_enabled || !user.two_factor_phone) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "two_factor_not_enabled",
      message: "Two-factor authentication isn't on for this account.",
    });
  }
  const challenge = await issueTwoFactorChallenge(user, "reauth");
  return {
    challenge_id: challenge.id,
    masked_destination: maskIdentifier(user.two_factor_phone),
    expires_in: TWO_FACTOR_TTL_MINUTES * 60,
  };
}

/** What the settings screen reads to draw the 2FA card. */
export async function getTwoFactorState(userId: string) {
  const user = await requireUser(userId);
  return {
    enabled: user.two_factor_enabled,
    method: user.two_factor_enabled ? ("sms" as const) : null,
    masked_destination: user.two_factor_phone ? maskIdentifier(user.two_factor_phone) : null,
    enrolled_at: user.two_factor_enrolled_at?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------
// §6 Forgot and reset password
// ---------------------------------------------------------------------

export async function forgotPassword(identifier: string) {
  const resolved = resolveIdentifier(identifier);
  const user = resolved ? await findUserByIdentifier(resolved.identifier) : undefined;

  // Always email, never SMS. An account's identity is its email address, and
  // the only SMS this product sends is a 2FA challenge the merchant opted
  // into — a reset code is not that. When there's no account we still echo a
  // masked form of whatever was typed, so the response shape never hints at
  // whether one exists (spec §6).
  const destination = user ? user.email : (resolved?.identifier ?? identifier);

  if (user) {
    const rawToken = generateOpaqueToken();
    await db<PasswordResetTokenRow>("password_reset_tokens")
      .where({ user_id: user.id, consumed_at: null })
      .update({ consumed_at: new Date() }); // invalidate any earlier unused token
    await db<PasswordResetTokenRow>("password_reset_tokens").insert({
      id: generateId("passwordResetToken"),
      user_id: user.id,
      token_hash: hashToken(rawToken),
      expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
    });
    const link = `${merchantAppUrl()}/reset-password?token=${rawToken}`;
    await emailAdapter.send({
      to: user.email,
      subject: "Reset your CRAL password",
      html: emailLayout({
        preheader: "Choose a new password for your CRAL account",
        bodyHtml: [
          emailHeading("Reset your password"),
          emailParagraph("Someone asked to reset the password on your CRAL account."),
          emailButton("Choose a new password", link),
          emailMuted(
            `This link expires in ${RESET_TOKEN_TTL_MINUTES} minutes. If this wasn't you, ignore this email — nothing has changed.`,
          ),
        ].join(""),
      }),
      text: `Someone asked to reset the password on your CRAL account.

Choose a new password: ${link}

The link expires in ${RESET_TOKEN_TTL_MINUTES} minutes. If this wasn't you, ignore this email - nothing has changed.`,
    });
  }

  return {
    status: "sent" as const,
    channel_hint: "email" as const,
    masked: maskIdentifier(destination),
    retry_after: 60,
  };
}

interface ResetLookupInput {
  token: string;
}

async function lookupResetTarget(
  input: ResetLookupInput,
): Promise<{ userId: string; consume: () => Promise<void> } | null> {
  const row = await db<PasswordResetTokenRow>("password_reset_tokens")
    .where({ token_hash: hashToken(input.token), consumed_at: null })
    .first();
  if (!row || row.expires_at < new Date()) return null;
  return {
    userId: row.user_id,
    consume: async () => {
      await db<PasswordResetTokenRow>("password_reset_tokens")
        .where({ id: row.id })
        .update({ consumed_at: new Date() });
    },
  };
}

export async function checkPasswordReset(input: ResetLookupInput) {
  const target = await lookupResetTarget(input);
  if (!target) return { valid: false };

  const user = await db<UserRow>("users").where({ id: target.userId }).first();
  return {
    valid: true,
    masked_identifier: user ? maskIdentifier(user.email) : null,
    requires_2fa: false,
  };
}

export async function resetPassword(
  input: ResetLookupInput & { new_password: string },
  ctx: RequestContext,
) {
  const target = await lookupResetTarget(input);
  if (!target) {
    throw new ApiError({
      status: 400,
      type: "conflict",
      code: "reset_token_expired",
      message: "This reset link has expired. Request a new one.",
    });
  }

  if (await isPasswordBreached(input.new_password)) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "password_breached",
      message: "This password has appeared in a known data breach. Choose another.",
      field: "new_password",
    });
  }

  const passwordHash = await hashPassword(input.new_password);
  await db<UserRow>("users").where({ id: target.userId }).update({ password_hash: passwordHash });
  await target.consume();

  const { revoked } = await db.transaction(async (trx) => {
    const revokedRows = await trx<SessionRow>("sessions")
      .where({ user_id: target.userId, revoked_at: null })
      .update({ revoked_at: new Date(), revoked_reason: "password_reset" });

    await writeAuditEntry(trx, {
      actorId: target.userId,
      actorType: "user",
      action: "user.password_reset",
      entityType: "user",
      entityId: target.userId,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return { revoked: revokedRows };
  });

  const user = await db<UserRow>("users").where({ id: target.userId }).first();
  if (user) {
    const notice =
      "Your CRAL password was just reset. If this wasn't you, contact support immediately.";
    // Notify on every channel the account actually has — an email-first
    // account has no phone yet (spec §6 asks for both where both exist).
    await Promise.all([
      ...(user.phone ? [smsAdapter.send({ to: user.phone, body: notice })] : []),
      emailAdapter.send({
        to: user.email,
        subject: "Your password was reset",
        html: emailLayout({
          preheader: "Your CRAL password was just changed",
          bodyHtml: [
            emailHeading("Your password was reset"),
            emailParagraph(
              "Your CRAL password was just changed, and you've been signed out everywhere.",
            ),
            emailMuted("If this wasn't you, contact support immediately."),
          ].join(""),
        }),
        text: notice,
      }),
    ]);
  }

  return { status: "reset" as const, sessions_revoked: revoked };
}

export async function changePassword(
  userId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
  ctx: RequestContext,
) {
  const user = await db<UserRow>("users").where({ id: userId }).first();
  if (!user) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "user_not_found",
      message: "Not found.",
    });
  }

  await assertNotLocked(user);

  const currentOk = await verifyPassword(user.password_hash, currentPassword);
  if (!currentOk) {
    await registerFailedAttempt(user);
    throw new ApiError({
      status: 401,
      type: "auth_error",
      code: "invalid_credentials",
      message: "Your current password is incorrect.",
    });
  }

  if (await isPasswordBreached(newPassword)) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "password_breached",
      message: "This password has appeared in a known data breach. Choose another.",
      field: "new_password",
    });
  }

  const passwordHash = await hashPassword(newPassword);

  const { revoked } = await db.transaction(async (trx) => {
    await trx<UserRow>("users")
      .where({ id: userId })
      .update({ password_hash: passwordHash, failed_login_count: 0, locked_until: null });

    const revokedRows = await trx<SessionRow>("sessions")
      .where({ user_id: userId, revoked_at: null })
      .andWhereNot({ id: currentSessionId })
      .update({ revoked_at: new Date(), revoked_reason: "password_change" });

    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "user.password_changed",
      entityType: "user",
      entityId: userId,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return { revoked: revokedRows };
  });

  return { sessions_revoked: revoked };
}

export function getPasswordPolicy() {
  return {
    min_length: 10,
    checks_breach_list: true,
    rejects_personal_info: true,
  };
}

// ---------------------------------------------------------------------
// Terms + /me
// ---------------------------------------------------------------------

export async function acceptTerms(
  userId: string,
  version: string,
  ctx: RequestContext,
): Promise<void> {
  await db<UserRow>("users").where({ id: userId }).update({
    terms_accepted_version: version,
    terms_accepted_at: new Date(),
    terms_accepted_ip: ctx.ip,
  });
}

export async function getMe(userId: string) {
  const user = await db<UserRow>("users").where({ id: userId }).first();
  if (!user) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "user_not_found",
      message: "Not found.",
    });
  }
  return {
    ...serializeUser(user),
    active_merchant_id: null, // merchants land in Phase 2
    unread_notification_count: 0, // notifications land later
    // Renter ID + driving-licence verification (customer-portal slice).
    // `verified` gates `POST /bookings`; the customer app's "finish setting
    // up" banner reads `outstanding`.
    renter_verification: await getRenterVerification(userId),
  };
}

export function isPhoneIdentifier(identifier: string): boolean {
  return isPhone(identifier);
}

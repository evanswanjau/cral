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
import { writeAuditEntry } from "../../lib/audit.js";
import type { OtpCodeRow, PasswordResetTokenRow, SessionRow, UserRow } from "./db-types.js";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TOKEN_TTL_MINUTES = 30;
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_MINUTES = 15;

type OtpPurpose = "signup" | "login" | "phone_change" | "password_reset";

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
    .where(resolved.kind === "phone" ? { phone: resolved.identifier } : { email: resolved.identifier })
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

async function sendOtp(identifier: string, kind: "phone" | "email", purpose: OtpPurpose): Promise<void> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await db<OtpCodeRow>("otp_codes").insert({
    id: generateId("otpCode"),
    identifier,
    purpose,
    code_hash: hashCode(code),
    expires_at: expiresAt,
  });

  const body = `Your Cruz Ride Auto code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`;
  if (kind === "phone") {
    await smsAdapter.send({ to: identifier, body });
  } else {
    await emailAdapter.send({ to: identifier, subject: "Your verification code", html: body, text: body });
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
  if (phone) {
    await sendOtp(phone, "phone", "signup");
    return { user: serializeUser(user), next: "verify_phone" as const };
  }
  await sendOtp(email, "email", "signup");
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
    throw new ApiError({ status: 404, type: "not_found", code: "user_not_found", message: "Not found." });
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
      .where(resolved.kind === "phone" ? { phone: resolved.identifier } : { email: resolved.identifier })
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
    const { session, refreshToken } = await createSession(user.id, input.deviceId ?? "otp-login", ctx);
    return { ...issueTokenPair(user, session, refreshToken), user: serializeUser(user), next: null };
  }

  return { verified: true };
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

export async function login(identifier: string, password: string, deviceId: string, ctx: RequestContext) {
  const user = await findUserByIdentifier(identifier);

  // Always run a hash comparison, even for an unknown identifier, so a
  // missing account and a wrong password take roughly the same time.
  const passwordHash = user?.password_hash ?? "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
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

  if (user.failed_login_count > 0 || user.locked_until) {
    await db<UserRow>("users").where({ id: user.id }).update({ failed_login_count: 0, locked_until: null });
  }

  const { session, refreshToken } = await createSession(user.id, deviceId, ctx);
  return { ...issueTokenPair(user, session, refreshToken), user: serializeUser(user), next: null };
}

export async function refreshToken(presentedToken: string, ctx: RequestContext) {
  const presentedHash = hashToken(presentedToken);

  const byCurrentHash = await db<SessionRow>("sessions").where({ token_hash: presentedHash }).first();

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
  const reused = await db<SessionRow>("sessions").where({ previous_token_hash: presentedHash }).first();
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

export async function logout(userId: string, sessionId: string, allDevices: boolean): Promise<void> {
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

// ---------------------------------------------------------------------
// §6 Forgot and reset password
// ---------------------------------------------------------------------

export async function forgotPassword(identifier: string) {
  const resolved = resolveIdentifier(identifier);
  const user = resolved ? await findUserByIdentifier(resolved.identifier) : undefined;

  // Chooses the channel from what the account has verified — falls back to
  // whatever the raw identifier *looks like* when there's no real account,
  // so the response shape never hints at whether one exists (spec §6).
  // An email-first account has no phone yet, so email is the only route.
  const smsPhone = user && !user.email_verified && user.phone && user.phone_verified ? user.phone : null;
  const useEmail = user ? smsPhone === null : resolved?.kind === "email";
  const destination = user ? (smsPhone ?? user.email) : (resolved?.identifier ?? identifier);

  if (user) {
    if (useEmail) {
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
      const link = `https://cral.co.ke/reset?token=${rawToken}`;
      await emailAdapter.send({
        to: user.email,
        subject: "Reset your Cruz Ride Auto password",
        html: `Reset your password: ${link}`,
        text: `Reset your password: ${link}`,
      });
    } else if (smsPhone) {
      await sendOtp(smsPhone, "phone", "password_reset");
    }
  }

  return {
    status: "sent" as const,
    channel_hint: useEmail ? ("email" as const) : ("sms" as const),
    masked: maskIdentifier(destination),
    retry_after: 60,
  };
}

interface ResetLookupInput {
  token?: string;
  phone?: string;
  code?: string;
}

async function lookupResetTarget(
  input: ResetLookupInput,
): Promise<{ userId: string; consume: () => Promise<void> } | null> {
  if (input.token) {
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

  if (input.phone && input.code) {
    const phone = normalizePhone(input.phone);
    if (!phone) return null;
    const row = await db<OtpCodeRow>("otp_codes")
      .where({ identifier: phone, purpose: "password_reset", consumed_at: null })
      .orderBy("created_at", "desc")
      .first();
    if (!row || row.expires_at < new Date() || row.attempts >= OTP_MAX_ATTEMPTS) return null;
    if (hashCode(input.code) !== row.code_hash) {
      await db<OtpCodeRow>("otp_codes")
        .where({ id: row.id })
        .update({ attempts: row.attempts + 1 });
      return null;
    }
    const user = await db<UserRow>("users").where({ phone }).first();
    if (!user) return null;
    return {
      userId: user.id,
      consume: async () => {
        await db<OtpCodeRow>("otp_codes").where({ id: row.id }).update({ consumed_at: new Date() });
      },
    };
  }

  return null;
}

export async function checkPasswordReset(input: ResetLookupInput) {
  const target = await lookupResetTarget(input);
  if (!target) return { valid: false };

  const user = await db<UserRow>("users").where({ id: target.userId }).first();
  return {
    valid: true,
    masked_identifier: user ? maskIdentifier(input.token ? user.email : (user.phone ?? user.email)) : null,
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
      message: "This reset link or code has expired. Request a new one.",
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
    const notice = "Your Cruz Ride Auto password was just reset. If this wasn't you, contact support immediately.";
    // Notify on every channel the account actually has — an email-first
    // account has no phone yet (spec §6 asks for both where both exist).
    await Promise.all([
      ...(user.phone ? [smsAdapter.send({ to: user.phone, body: notice })] : []),
      emailAdapter.send({ to: user.email, subject: "Your password was reset", html: notice, text: notice }),
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
    throw new ApiError({ status: 404, type: "not_found", code: "user_not_found", message: "Not found." });
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

export async function acceptTerms(userId: string, version: string, ctx: RequestContext): Promise<void> {
  await db<UserRow>("users")
    .where({ id: userId })
    .update({ terms_accepted_version: version, terms_accepted_at: new Date(), terms_accepted_ip: ctx.ip });
}

export async function getMe(userId: string) {
  const user = await db<UserRow>("users").where({ id: userId }).first();
  if (!user) {
    throw new ApiError({ status: 404, type: "not_found", code: "user_not_found", message: "Not found." });
  }
  return {
    ...serializeUser(user),
    active_merchant_id: null, // merchants land in Phase 2
    unread_notification_count: 0, // notifications land later
  };
}

export function isPhoneIdentifier(identifier: string): boolean {
  return isPhone(identifier);
}

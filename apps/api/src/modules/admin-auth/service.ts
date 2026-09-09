import { ApiError } from "@cral/types";
import type { Knex } from "knex";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { verifyPassword } from "../../lib/password.js";
import {
  signAdminAccessToken,
  ADMIN_ACCESS_TOKEN_TTL_SECONDS,
  type AdminAccessTokenClaims,
} from "../../lib/jwt.js";
import { generateOtpCode, hashCode } from "../../lib/otp.js";
import { generateOpaqueToken, hashToken } from "../../lib/tokens.js";
import { maskIdentifier } from "../../lib/mask.js";
import { smsAdapter } from "../../lib/adapters.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import type { AdminLoginChallengeRow, AdminSessionRow, AdminUserRow } from "./db-types.js";

const CHALLENGE_TTL_MINUTES = 10;
const CHALLENGE_MAX_ATTEMPTS = 5;
/** Spec §8: a session lives at most 8 hours, no matter how active. */
const SESSION_ABSOLUTE_HOURS = 8;

/** A never-valid argon2id hash, so an unknown email still costs one verify. */
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export interface RequestContext {
  ip: string | null;
  requestId: string | null;
  userAgent: string | null;
}

function invalidCredentials(): ApiError {
  return new ApiError({
    status: 401,
    type: "auth_error",
    code: "invalid_admin_credentials",
    message: "That email and password do not match.",
  });
}

function challengeGone(): ApiError {
  return new ApiError({
    status: 400,
    type: "conflict",
    code: "admin_challenge_expired",
    message: "That sign-in attempt has expired. Start again.",
  });
}

async function issueSession(
  trx: Knex | Knex.Transaction,
  admin: AdminUserRow,
  deviceId: string,
  ctx: RequestContext,
): Promise<{ session: AdminSessionRow; refreshToken: string }> {
  const refreshToken = generateOpaqueToken();
  const now = new Date();
  const [session] = await trx<AdminSessionRow>("admin_sessions")
    .insert({
      id: generateId("adminSession"),
      admin_user_id: admin.id,
      device_id: deviceId,
      user_agent: ctx.userAgent,
      ip: ctx.ip,
      token_hash: hashToken(refreshToken),
      expires_at: new Date(now.getTime() + SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000),
      last_seen_at: now,
    })
    .returning("*");
  if (!session) throw new Error("Failed to create admin session");
  return { session, refreshToken };
}

function tokenPair(admin: AdminUserRow, session: AdminSessionRow, refreshToken: string) {
  const claims: Omit<AdminAccessTokenClaims, "aud"> = {
    sub: admin.id,
    sid: session.id,
    role: admin.role,
  };
  return {
    access_token: signAdminAccessToken(claims),
    refresh_token: refreshToken,
    expires_in: ADMIN_ACCESS_TOKEN_TTL_SECONDS,
  };
}

// ---------------------------------------------------------------------
// §8 Admin authentication
// ---------------------------------------------------------------------

/**
 * Step 1: email + password. A correct password never returns tokens — the
 * mandatory second factor comes first, with no "remember this device"
 * shortcut. The opaque `challenge_token` (only its hash is stored) is the
 * only thing that identifies the pending login at step 2.
 */
export async function adminLogin(
  email: string,
  password: string,
  deviceId: string,
  _ctx: RequestContext,
): Promise<{ challenge_token: string; next: "2fa"; masked_destination: string; expires_in: number }> {
  const admin = await db<AdminUserRow>("admin_users")
    .where({ email: email.trim().toLowerCase() })
    .first();

  const passwordOk = await verifyPassword(admin?.password_hash ?? DUMMY_HASH, password).catch(
    () => false,
  );
  if (!admin || !passwordOk) throw invalidCredentials();

  if (admin.status !== "active") {
    throw new ApiError({
      status: 403,
      type: "auth_error",
      code: "admin_account_disabled",
      message: "This admin account is not active. Contact an owner.",
    });
  }

  // Retire any half-finished challenge for this admin before starting a new one.
  await db<AdminLoginChallengeRow>("admin_login_challenges")
    .where({ admin_user_id: admin.id, consumed_at: null })
    .update({ consumed_at: new Date() });

  const challengeToken = generateOpaqueToken();
  const code = generateOtpCode();
  await db<AdminLoginChallengeRow>("admin_login_challenges").insert({
    id: generateId("adminLoginChallenge"),
    admin_user_id: admin.id,
    token_hash: hashToken(challengeToken),
    code_hash: hashCode(code),
    device_id: deviceId,
    expires_at: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000),
  });

  await smsAdapter.send({
    to: admin.phone,
    body: `${code} is your CRAL Ops sign-in code. It expires in ${CHALLENGE_TTL_MINUTES} minutes.`,
  });

  return {
    challenge_token: challengeToken,
    next: "2fa",
    masked_destination: maskIdentifier(admin.phone),
    expires_in: CHALLENGE_TTL_MINUTES * 60,
  };
}

/** Step 2: the texted six-digit code. Only now does a session exist. */
export async function adminVerifyTwoFactor(
  challengeToken: string,
  presented: string,
  ctx: RequestContext,
) {
  const challenge = await db<AdminLoginChallengeRow>("admin_login_challenges")
    .where({ token_hash: hashToken(challengeToken), consumed_at: null })
    .first();

  if (
    !challenge ||
    challenge.expires_at < new Date() ||
    challenge.attempts >= CHALLENGE_MAX_ATTEMPTS
  ) {
    throw challengeGone();
  }

  if (hashCode(presented.trim()) !== challenge.code_hash) {
    await db<AdminLoginChallengeRow>("admin_login_challenges")
      .where({ id: challenge.id })
      .update({ attempts: challenge.attempts + 1 });
    throw new ApiError({
      status: 401,
      type: "auth_error",
      code: "admin_two_factor_invalid",
      message: "That code isn't right.",
      field: "code",
    });
  }

  const admin = await db<AdminUserRow>("admin_users").where({ id: challenge.admin_user_id }).first();
  if (!admin || admin.status !== "active") throw challengeGone();

  const pair = await db.transaction(async (trx) => {
    await trx<AdminLoginChallengeRow>("admin_login_challenges")
      .where({ id: challenge.id })
      .update({ consumed_at: new Date() });

    const { session, refreshToken } = await issueSession(trx, admin, challenge.device_id, ctx);
    await trx<AdminUserRow>("admin_users").where({ id: admin.id }).update({ last_login_at: new Date() });
    await writeAuditEntry(trx, {
      actorId: admin.id,
      actorType: "admin",
      action: "admin.login",
      entityType: "admin_user",
      entityId: admin.id,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return tokenPair(admin, session, refreshToken);
  });

  return pair;
}

/**
 * Rotates the refresh token. Enforces both §8 clocks:
 *  - the 8-hour absolute cap (`expires_at`, set once and never moved);
 *  - the 20-minute idle window (`last_seen_at`). An idle-expired session is
 *    revoked and the caller must sign in again — the "re-prompt for the
 *    second factor only" path is a later refinement; today it's a full
 *    login, which is stricter, not looser.
 */
export async function adminRefresh(presentedToken: string, ctx: RequestContext) {
  const presentedHash = hashToken(presentedToken);
  const IDLE_MS = 20 * 60 * 1000;

  const session = await db<AdminSessionRow>("admin_sessions")
    .where({ token_hash: presentedHash })
    .first();

  if (session) {
    const now = new Date();
    if (session.revoked_at || session.expires_at < now) {
      throw new ApiError({
        status: 401,
        type: "auth_error",
        code: "admin_session_expired",
        message: "Your session has ended. Sign in again.",
      });
    }
    if (now.getTime() - session.last_seen_at.getTime() > IDLE_MS) {
      await db<AdminSessionRow>("admin_sessions")
        .where({ id: session.id })
        .update({ revoked_at: now, revoked_reason: "idle_timeout" });
      throw new ApiError({
        status: 401,
        type: "auth_error",
        code: "idle_timeout_2fa_required",
        message: "You were signed out after 20 minutes idle. Sign in again.",
      });
    }

    const admin = await db<AdminUserRow>("admin_users").where({ id: session.admin_user_id }).first();
    if (!admin || admin.status !== "active") {
      await db<AdminSessionRow>("admin_sessions")
        .where({ id: session.id })
        .update({ revoked_at: now, revoked_reason: "revoked" });
      throw new ApiError({
        status: 401,
        type: "auth_error",
        code: "admin_session_expired",
        message: "Your session has ended. Sign in again.",
      });
    }

    const newRefreshToken = generateOpaqueToken();
    await db<AdminSessionRow>("admin_sessions")
      .where({ id: session.id })
      .update({
        token_hash: hashToken(newRefreshToken),
        previous_token_hash: presentedHash,
        last_seen_at: now,
        ip: ctx.ip,
      });

    return tokenPair(admin, session, newRefreshToken);
  }

  // A previously-rotated token presented again — replay. Kill the session.
  const reused = await db<AdminSessionRow>("admin_sessions")
    .where({ previous_token_hash: presentedHash })
    .first();
  if (reused && !reused.revoked_at) {
    await db<AdminSessionRow>("admin_sessions")
      .where({ id: reused.id })
      .update({ revoked_at: new Date(), revoked_reason: "reuse_detected" });
  }

  throw new ApiError({
    status: 401,
    type: "auth_error",
    code: "invalid_refresh_token",
    message: "Sign in again.",
  });
}

export async function getAdminMe(adminId: string) {
  const admin = await db<AdminUserRow>("admin_users").where({ id: adminId }).first();
  if (!admin) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "admin_not_found",
      message: "That admin account no longer exists.",
    });
  }
  return {
    id: admin.id,
    email: admin.email,
    full_name: admin.full_name,
    role: admin.role,
    assigned_queues: admin.assigned_queues,
  };
}

export async function adminLogout(adminId: string, sessionId: string, ctx: RequestContext) {
  await db.transaction(async (trx) => {
    await trx<AdminSessionRow>("admin_sessions")
      .where({ id: sessionId, revoked_at: null })
      .update({ revoked_at: new Date(), revoked_reason: "logout" });
    await writeAuditEntry(trx, {
      actorId: adminId,
      actorType: "admin",
      action: "admin.logout",
      entityType: "admin_user",
      entityId: adminId,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });
}

/** This admin's own recent actions (spec §8) — the reviewer's activity log. */
export async function getAdminOwnAudit(adminId: string, cursor: string | undefined, limit: number) {
  const rows = await applyCursor(
    db("audit_log").where({ actor_id: adminId, actor_type: "admin" }),
    { sortColumn: "created_at", direction: "desc", limit, ...(cursor ? { cursor } : {}) },
  );
  const page = toPaginatedResult(
    rows as Array<{ id: string; created_at: Date }>,
    limit,
    "created_at",
  );
  return {
    data: page.data.map((r) => {
      const row = r as unknown as {
        id: string;
        action: string;
        entity_type: string;
        entity_id: string;
        request_id: string | null;
        created_at: Date;
      };
      return {
        id: row.id,
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        request_id: row.request_id,
        created_at: row.created_at.toISOString(),
      };
    }),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
  };
}

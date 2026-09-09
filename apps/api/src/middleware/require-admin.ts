import type { NextFunction, Request, Response } from "express";
import { ApiError } from "@cral/types";
import { db } from "../db/client.js";
import { verifyAdminAccessToken, type AdminAccessTokenClaims, type AdminRole } from "../lib/jwt.js";
import type { AdminSessionRow } from "../modules/admin-auth/db-types.js";

export interface AdminContext {
  id: string;
  name: string;
  role: AdminRole;
  queues: string[];
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminContext;
    }
  }
}

/** How long an admin session may sit idle before a refresh must re-2FA (spec §8). */
const IDLE_TIMEOUT_MS = 20 * 60 * 1000;

function rejected(message: string, code = "invalid_admin_token"): ApiError {
  return new ApiError({ status: 401, type: "auth_error", code, message });
}

function forbidden(): ApiError {
  // Spec §8: insufficient_scope, never 404 — hiding the endpoint hides the bug.
  return new ApiError({
    status: 403,
    type: "auth_error",
    code: "insufficient_scope",
    message: "Your role doesn't have access to this.",
  });
}

interface RequireAdminOptions {
  /** One role, or any of several. `admin_super` always passes regardless. */
  role?: AdminRole | AdminRole[];
  /** A queue slug the admin must be assigned. `admin_super` bypasses this. */
  queue?: string;
}

/**
 * Gate for every `/admin/*` route. Mirrors `authenticate()` for the public
 * audience but against the ops identity store:
 *
 *  - a valid `aud: "ops"` bearer token (a public token fails here);
 *  - a live `admin_sessions` row — signature alone is not enough, same
 *    rule as the 2026-09-03 reliability patch made for merchant sessions;
 *  - the session is within its 8-hour absolute cap and its 20-minute idle
 *    window (`last_seen_at`, which this bumps on every authenticated hit);
 *  - the admin's role (and, when asked, an assigned queue). `admin_super`
 *    clears every role and queue check.
 *
 * Mount it *before* `requireIdempotencyKey()` on any route that has both,
 * so the key is scoped to a known admin.
 */
export function requireAdmin(options: RequireAdminOptions = {}) {
  const allowedRoles =
    options.role === undefined
      ? null
      : Array.isArray(options.role)
        ? options.role
        : [options.role];

  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) {
      next(rejected("This request requires an admin access token.", "authentication_required"));
      return;
    }

    let claims: AdminAccessTokenClaims;
    try {
      claims = verifyAdminAccessToken(token);
    } catch {
      next(rejected("Your session has expired. Sign in again."));
      return;
    }

    db<AdminSessionRow>("admin_sessions")
      .where({ id: claims.sid })
      .first()
      .then(async (session) => {
        const now = new Date();
        if (!session || session.revoked_at !== null || session.expires_at < now) {
          next(rejected("Your session has ended. Sign in again.", "admin_session_revoked"));
          return;
        }
        if (now.getTime() - session.last_seen_at.getTime() > IDLE_TIMEOUT_MS) {
          await db<AdminSessionRow>("admin_sessions")
            .where({ id: session.id })
            .update({ revoked_at: now, revoked_reason: "idle_timeout" });
          next(rejected("You were signed out after 20 minutes idle.", "idle_timeout_2fa_required"));
          return;
        }

        const admin = await db<{
          id: string;
          full_name: string;
          role: AdminRole;
          assigned_queues: string[];
          status: string;
        }>("admin_users")
          .where({ id: session.admin_user_id })
          .first();
        if (!admin || admin.status !== "active") {
          next(rejected("This admin account is not active.", "admin_account_disabled"));
          return;
        }

        const isSuper = admin.role === "admin_super";
        if (!isSuper && allowedRoles && !allowedRoles.includes(admin.role)) {
          next(forbidden());
          return;
        }
        if (!isSuper && options.queue && !admin.assigned_queues.includes(options.queue)) {
          next(forbidden());
          return;
        }

        await db<AdminSessionRow>("admin_sessions")
          .where({ id: session.id })
          .update({ last_seen_at: now });

        req.admin = {
          id: admin.id,
          name: admin.full_name,
          role: admin.role,
          queues: admin.assigned_queues,
          sessionId: session.id,
        };
        next();
      })
      .catch((error: unknown) => next(error));
  };
}

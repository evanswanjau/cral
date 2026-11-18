import type { NextFunction, Request, Response } from "express";
import { ApiError } from "@cral/types";
import { db } from "../db/client.js";
import { verifyAccessToken, type AccessTokenClaims } from "../lib/jwt.js";
import { assistScopeError, isAssistAllowed, onboardingSubmittedError } from "../lib/assist.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenClaims;
      /** Set when the caller is a sales agent's assist session (PR AG3), never otherwise. */
      assist?: { adminId: string; sessionId: string };
    }
  }
}

interface SessionCheckRow {
  id: string;
  user_id: string;
  revoked_at: Date | null;
  expires_at: Date;
  kind: string;
  assisted_by: string | null;
}

function rejected(message: string, code = "invalid_access_token"): ApiError {
  return new ApiError({
    status: 401,
    type: "auth_error",
    code,
    message,
  });
}

/**
 * Requires a valid Authorization: Bearer <access_token> (spec §2).
 *
 * The signature is necessary but not sufficient: the token's session must
 * still be live. Verifying the signature alone meant a revoked session kept
 * working until the access token expired — up to fifteen minutes after
 * `logout`, `POST /auth/sessions/revoke-all`, a per-session `DELETE`, or the
 * revocation that close-account performs. Settings → Security's "Sign out
 * everywhere else" is a promise made to someone who thinks another person is
 * in their account, so a quarter-hour of continued access is the one place
 * that delay actually matters.
 *
 * This is a primary-key lookup per authenticated request, deliberately
 * rather than the Redis denylist the review sketched. There are twelve
 * places that revoke a session, and a denylist that misses one is a silent
 * hole; this cannot drift, because it reads the same column those twelve
 * writes set. If it ever shows up in profiling, cache *positively* (session
 * id → live, short TTL) rather than reintroducing a denylist.
 *
 * Note this is about explicit revocation, not account suspension: a
 * suspended account still loses access at the next refresh, which is the
 * documented and deliberate design (see `refreshToken`).
 */
export function authenticate() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    if (!token) {
      next(rejected("This request requires a valid access token.", "authentication_required"));
      return;
    }

    let claims: AccessTokenClaims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      next(rejected("Your session has expired. Please sign in again."));
      return;
    }

    // Express 4 doesn't catch a rejected promise from middleware, so this
    // resolves its own errors into next() rather than being declared async.
    db<SessionCheckRow>("sessions")
      .where({ id: claims.sid })
      .first("id", "user_id", "revoked_at", "expires_at", "kind", "assisted_by")
      .then(async (session) => {
        if (!session || session.revoked_at !== null || session.expires_at < new Date()) {
          next(rejected("Your session has ended. Please sign in again.", "session_revoked"));
          return;
        }

        // Assist sessions (PR AG3). The session row decides, not the
        // token: an `asb` claim on an ordinary session, or an assist row
        // whose claim doesn't match it, is refused outright.
        if (session.kind !== "assist") {
          if (claims.asb !== undefined) {
            next(rejected("Your session has ended. Please sign in again.", "session_revoked"));
            return;
          }
          req.auth = claims;
          next();
          return;
        }
        if (!session.assisted_by || claims.asb !== session.assisted_by || claims.sub !== session.user_id) {
          next(rejected("Your session has ended. Please sign in again.", "session_revoked"));
          return;
        }
        // The allowlist is the main control: anything outside onboarding
        // is 403 before any handler runs.
        if (!isAssistAllowed(req.method, (req.route as { path?: string } | undefined)?.path)) {
          next(assistScopeError());
          return;
        }
        const [agent, merchant] = await Promise.all([
          db("admin_users").where({ id: session.assisted_by }).first("status"),
          db("merchants").where({ user_id: session.user_id }).first("onboarding_submitted"),
        ]);
        // A disabled agent's sessions die with their access.
        if (!agent || agent.status !== "active") {
          next(rejected("Your session has ended. Please sign in again.", "session_revoked"));
          return;
        }
        if (merchant?.onboarding_submitted) {
          next(onboardingSubmittedError());
          return;
        }
        req.auth = claims;
        req.assist = { adminId: session.assisted_by, sessionId: session.id };
        next();
      })
      .catch((error: unknown) => {
        next(error);
      });
  };
}

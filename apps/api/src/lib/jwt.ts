import jwt from "jsonwebtoken";

const ACCESS_TOKEN_TTL_MINUTES = Number(process.env.ACCESS_TOKEN_TTL_MINUTES ?? 15);
// Spec §8: the ops audience gets a deliberately shorter access token.
const ADMIN_ACCESS_TOKEN_TTL_MINUTES = Number(process.env.ADMIN_ACCESS_TOKEN_TTL_MINUTES ?? 10);

export interface AccessTokenClaims {
  sub: string; // user id
  sid: string; // session id — lets /auth/logout revoke "the current session" without needing the refresh token in the body
  roles: string[];
  aud: "public"; // spec §8: admin tokens carry aud: "ops" and are issued by a wholly separate flow
}

export type AdminRole = "admin_reviewer" | "admin_finance" | "admin_support" | "admin_super";

export interface AdminAccessTokenClaims {
  sub: string; // admin_users.id
  sid: string; // admin_sessions.id
  role: AdminRole;
  aud: "ops";
}

/** The values shipped in .env.example, which must never sign a real token. */
const DEV_PLACEHOLDER_SECRET = "dev_only_change_me_access";
const DEV_PLACEHOLDER_ADMIN_SECRET = "dev_only_change_me_admin";
const MIN_PRODUCTION_SECRET_LENGTH = 32;

function assertProductionSecret(name: string, value: string, placeholder: string): void {
  // A committed placeholder is a published signing key: anyone reading
  // .env.example could mint a token. Fail rather than serve traffic that
  // only looks authenticated.
  if (process.env.NODE_ENV !== "production") return;
  if (value === placeholder) {
    throw new Error(
      `${name} is still the .env.example placeholder. Set a real secret before deploying.`,
    );
  }
  if (value.length < MIN_PRODUCTION_SECRET_LENGTH) {
    throw new Error(`${name} must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`);
  }
}

function secret(): string {
  const value = process.env.JWT_ACCESS_SECRET;
  if (!value) throw new Error("JWT_ACCESS_SECRET is not set");
  assertProductionSecret("JWT_ACCESS_SECRET", value, DEV_PLACEHOLDER_SECRET);
  return value;
}

/**
 * Signing key for the ops audience. Deliberately separate from
 * `JWT_ACCESS_SECRET`: a leak of one audience's key must not let a caller
 * mint tokens for the other.
 */
function adminSecret(): string {
  const value = process.env.JWT_ADMIN_SECRET;
  if (!value) throw new Error("JWT_ADMIN_SECRET is not set");
  assertProductionSecret("JWT_ADMIN_SECRET", value, DEV_PLACEHOLDER_ADMIN_SECRET);
  return value;
}

export function signAccessToken(claims: Omit<AccessTokenClaims, "aud">): string {
  return jwt.sign({ ...claims, aud: "public" } satisfies AccessTokenClaims, secret(), {
    algorithm: "HS256",
    expiresIn: `${ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  // Pin both the audience and the algorithm. `aud` is what keeps an admin
  // token (`aud: "ops"`, issued by a wholly separate flow) from being
  // accepted by these public merchant endpoints — the claim has always been
  // written, but nothing checked it until the 2026-09-03 security patch.
  // `algorithms` pins the verifier to the one algorithm we sign with rather
  // than letting the token's own header choose.
  return jwt.verify(token, secret(), {
    algorithms: ["HS256"],
    audience: "public",
  }) as AccessTokenClaims;
}

export function signAdminAccessToken(claims: Omit<AdminAccessTokenClaims, "aud">): string {
  return jwt.sign({ ...claims, aud: "ops" } satisfies AdminAccessTokenClaims, adminSecret(), {
    algorithm: "HS256",
    expiresIn: `${ADMIN_ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

export function verifyAdminAccessToken(token: string): AdminAccessTokenClaims {
  // The mirror of `verifyAccessToken` for the ops audience: a separate key,
  // `aud` pinned to "ops", `algorithms` pinned to the one we sign with. A
  // public (`aud: "public"`) token fails here, and an ops token fails the
  // public verifier — the boundary runs both ways.
  return jwt.verify(token, adminSecret(), {
    algorithms: ["HS256"],
    audience: "ops",
  }) as AdminAccessTokenClaims;
}

export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_MINUTES * 60;
export const ADMIN_ACCESS_TOKEN_TTL_SECONDS = ADMIN_ACCESS_TOKEN_TTL_MINUTES * 60;

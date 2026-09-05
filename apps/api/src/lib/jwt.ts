import jwt from "jsonwebtoken";

const ACCESS_TOKEN_TTL_MINUTES = Number(process.env.ACCESS_TOKEN_TTL_MINUTES ?? 15);

export interface AccessTokenClaims {
  sub: string; // user id
  sid: string; // session id — lets /auth/logout revoke "the current session" without needing the refresh token in the body
  roles: string[];
  aud: "public"; // spec §8: admin tokens carry aud: "ops" and are issued by a wholly separate flow (Phase 3)
}

/** The value shipped in .env.example, which must never sign a real token. */
const DEV_PLACEHOLDER_SECRET = "dev_only_change_me_access";
const MIN_PRODUCTION_SECRET_LENGTH = 32;

function secret(): string {
  const value = process.env.JWT_ACCESS_SECRET;
  if (!value) throw new Error("JWT_ACCESS_SECRET is not set");

  // A committed placeholder is a published signing key: anyone reading
  // .env.example could mint a token for any user id. Fail the boot rather
  // than serve traffic that only looks authenticated.
  if (process.env.NODE_ENV === "production") {
    if (value === DEV_PLACEHOLDER_SECRET) {
      throw new Error(
        "JWT_ACCESS_SECRET is still the .env.example placeholder. Set a real secret before deploying.",
      );
    }
    if (value.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `JWT_ACCESS_SECRET must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`,
      );
    }
  }

  return value;
}

export function signAccessToken(claims: Omit<AccessTokenClaims, "aud">): string {
  return jwt.sign({ ...claims, aud: "public" } satisfies AccessTokenClaims, secret(), {
    algorithm: "HS256",
    expiresIn: `${ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  // Pin both the audience and the algorithm. `aud` is what keeps a Phase-3
  // admin token (`aud: "ops"`, issued by a wholly separate flow) from being
  // accepted by these public merchant endpoints the day that flow exists —
  // the claim has always been written, but nothing checked it. `algorithms`
  // pins the verifier to the one algorithm we sign with rather than letting
  // the token's own header choose.
  return jwt.verify(token, secret(), {
    algorithms: ["HS256"],
    audience: "public",
  }) as AccessTokenClaims;
}

export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_MINUTES * 60;

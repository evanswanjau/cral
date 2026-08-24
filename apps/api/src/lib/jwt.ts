import jwt from "jsonwebtoken";

const ACCESS_TOKEN_TTL_MINUTES = Number(process.env.ACCESS_TOKEN_TTL_MINUTES ?? 15);

export interface AccessTokenClaims {
  sub: string; // user id
  sid: string; // session id — lets /auth/logout revoke "the current session" without needing the refresh token in the body
  roles: string[];
  aud: "public"; // spec §8: admin tokens carry aud: "ops" and are issued by a wholly separate flow (Phase 3)
}

function secret(): string {
  const value = process.env.JWT_ACCESS_SECRET;
  if (!value) throw new Error("JWT_ACCESS_SECRET is not set");
  return value;
}

export function signAccessToken(claims: Omit<AccessTokenClaims, "aud">): string {
  return jwt.sign({ ...claims, aud: "public" } satisfies AccessTokenClaims, secret(), {
    expiresIn: `${ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, secret()) as AccessTokenClaims;
}

export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_MINUTES * 60;

import { randomBytes, createHash } from "node:crypto";

/** Opaque random tokens for refresh tokens and password-reset links (spec §5/§6). */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

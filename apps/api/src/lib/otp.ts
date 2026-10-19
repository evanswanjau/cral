import { randomInt, createHash } from "node:crypto";

/** Numeric OTP, zero-padded to a fixed width. Six digits by default (spec §4/§6). */
export function generateOtpCode(digits = 6): string {
  return randomInt(0, 10 ** digits).toString().padStart(digits, "0");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

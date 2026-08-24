import { randomInt, createHash } from "node:crypto";

/** 6-digit numeric OTP, per spec §4/§6 (never zero-padded away — always 6 digits). */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

import { apiPost } from "./api.js";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

type OtpPurpose = "signup" | "login" | "password_reset";

// --- sign in ----------------------------------------------------------

export interface SignedIn extends TokenPair {
  user: unknown;
  next: string | null;
}

/** A password login against an account with opt-in SMS 2FA carries no tokens. */
export interface TwoFactorRequired {
  next: "2fa";
  challenge_id: string;
  masked_destination: string;
  expires_in: number;
}

export type LoginResult = SignedIn | TwoFactorRequired;

export function isTwoFactorRequired(result: LoginResult): result is TwoFactorRequired {
  return result.next === "2fa";
}

export function login(identifier: string, password: string, deviceId: string) {
  return apiPost<LoginResult>(
    "/auth/login",
    { identifier, password, device_id: deviceId },
    { auth: false },
  );
}

/** Second half of a 2FA sign-in. No UI reaches this yet — settings can't enrol anyone. */
export function completeTwoFactorChallenge(challengeId: string, code: string) {
  return apiPost<SignedIn & { used_recovery_code: boolean }>(
    "/auth/2fa/challenge",
    { challenge_id: challengeId, code },
    { auth: false },
  );
}

export function requestOtp(identifier: string, purpose: OtpPurpose) {
  return apiPost<{ retry_after: number; masked_destination: string }>(
    "/auth/otp/request",
    { identifier, purpose },
    { auth: false },
  );
}

export function verifyLoginOtp(identifier: string, code: string, deviceId: string) {
  return apiPost<TokenPair & { user: unknown; next: string | null }>(
    "/auth/otp/verify",
    { identifier, purpose: "login", code, device_id: deviceId },
    { auth: false },
  );
}

// --- register ---------------------------------------------------------

/**
 * Sign-up is email + password only. Full name and phone are collected in
 * onboarding — the phone at payout setup, where the reason for asking is
 * obvious — rather than gating the signup form behind an SMS.
 */
export function register(email: string, password: string) {
  return apiPost<{
    user: { id: string; email: string };
    next: "verify_email" | "verify_phone" | null;
  }>(
    "/auth/register",
    { email, password, role: "merchant", accepted_terms_version: TERMS_VERSION },
    { auth: false },
  );
}

export function verifySignupOtp(identifier: string, code: string) {
  return apiPost<{ verified: boolean }>(
    "/auth/otp/verify",
    { identifier, purpose: "signup", code },
    { auth: false },
  );
}

/** Bump when the merchant terms change; recorded against the account at sign-up (spec §4). */
export const TERMS_VERSION = "2026-08-24";

// --- forgot / reset password ------------------------------------------

/** Always emails a reset link — see the note on the server's forgotPassword. */
export function forgotPassword(email: string) {
  return apiPost<{ status: string; channel_hint: "email"; masked: string; retry_after: number }>(
    "/auth/password/forgot",
    { identifier: email },
    { auth: false },
  );
}

export function checkPasswordReset(input: { token: string }) {
  return apiPost<{ valid: boolean; masked_identifier?: string | null; requires_2fa?: boolean }>(
    "/auth/password/reset/check",
    input,
    { auth: false },
  );
}

export function resetPassword(input: { token: string; new_password: string }) {
  return apiPost<{ status: string; sessions_revoked: number }>("/auth/password/reset", input, {
    auth: false,
  });
}

import { apiPost } from "./api.js";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

type OtpPurpose = "signup" | "login" | "password_reset";

// --- sign in ----------------------------------------------------------

export function login(identifier: string, password: string, deviceId: string) {
  return apiPost<TokenPair & { user: unknown; next: string | null }>(
    "/auth/login",
    { identifier, password, device_id: deviceId },
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

export interface RegisterInput {
  full_name: string;
  phone: string;
  email: string;
  password: string;
}

export function register(input: RegisterInput) {
  return apiPost<{ user: { id: string; phone: string; email: string }; next: string | null }>(
    "/auth/register",
    { ...input, role: "merchant", accepted_terms_version: TERMS_VERSION },
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

export function forgotPassword(identifier: string) {
  return apiPost<{ status: string; channel_hint: "email" | "sms"; masked: string; retry_after: number }>(
    "/auth/password/forgot",
    { identifier },
    { auth: false },
  );
}

export function checkPasswordReset(input: { token?: string; phone?: string; code?: string }) {
  return apiPost<{ valid: boolean; masked_identifier?: string | null; requires_2fa?: boolean }>(
    "/auth/password/reset/check",
    input,
    { auth: false },
  );
}

export function resetPassword(input: {
  token?: string;
  phone?: string;
  code?: string;
  new_password: string;
}) {
  return apiPost<{ status: string; sessions_revoked: number }>("/auth/password/reset", input, {
    auth: false,
  });
}

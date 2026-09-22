import { apiDelete, apiGet, apiPatch, apiPost } from "./api.js";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface RegisterResponse {
  user: { id: string; full_name: string | null; phone: string | null; email: string };
  next: "verify_phone" | "verify_email" | null;
}

export function register(input: {
  email: string;
  password: string;
  role: "customer" | "merchant";
  accepted_terms_version: string;
  // Optional - onboarding/the account page collects these later, so
  // sign-up itself stays email + password only (backend RegisterSchema).
  full_name?: string;
  phone?: string;
}) {
  return apiPost<RegisterResponse>("/auth/register", input, { auth: false });
}

export function verifySignupOtp(identifier: string, code: string) {
  return apiPost<{ verified: boolean }>(
    "/auth/otp/verify",
    { identifier, purpose: "signup", code },
    { auth: false },
  );
}

export function requestOtp(identifier: string, purpose: "signup" | "login") {
  return apiPost<{ retry_after: number; masked_destination: string }>(
    "/auth/otp/request",
    { identifier, purpose },
    { auth: false },
  );
}

export function login(identifier: string, password: string, deviceId: string) {
  return apiPost<TokenPair & { user: unknown; next: string | null }>(
    "/auth/login",
    { identifier, password, device_id: deviceId },
    { auth: false },
  );
}

export function logout(allDevices = false) {
  return apiPost<void>("/auth/logout", { all_devices: allDevices });
}

export interface Session {
  id: string;
  device: string;
  approximate_location: string | null;
  last_seen_at: string;
  is_current: boolean;
}

export function listSessions() {
  return apiGet<{ data: Session[] }>("/auth/sessions");
}

export function revokeSession(id: string) {
  return apiDelete<void>(`/auth/sessions/${id}`);
}

export function forgotPassword(identifier: string) {
  return apiPost<{ status: string; channel_hint: "email" | "sms"; masked: string; retry_after: number }>(
    "/auth/password/forgot",
    { identifier },
    { auth: false },
  );
}

export function checkPasswordReset(input: { token?: string; phone?: string; code?: string }) {
  return apiPost<{ valid: boolean; masked_identifier?: string | null }>(
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

export interface Me {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string;
  roles: string[];
  phone_verified: boolean;
  email_verified: boolean;
  active_merchant_id: string | null;
  /**
   * Wired up but currently always 0 server-side (`auth/service.ts#getMe`'s
   * comment predates the C8 notifications feed) - `Masthead`'s unread
   * badge does NOT read this; it queries `/me/notifications` directly,
   * which is real.
   */
  unread_notification_count: number;
  renter_verification: {
    verified: boolean;
    documents: { kind: string; state: string; review_note: string | null }[];
    outstanding: string[];
  };
}

export function getMe() {
  return apiGet<Me>("/me");
}

/**
 * Phone verification. Reused verbatim from the merchant side's payout-phone
 * flow - a renter verifies at the booking-request step, where the reason
 * is self-evident (the owner rings this number, the M-Pesa prompt goes to
 * it, and the "your request was accepted" SMS needs a proven number).
 */
export function startPhoneVerification() {
  return apiPost<{ masked_destination: string; retry_after: number }>(
    "/auth/phone/verification/start",
    {},
  );
}

export function confirmPhoneVerification(code: string) {
  return apiPost<{ phone_verified: boolean }>("/auth/phone/verification/confirm", { code });
}

/** Changes the account phone. Clears `phone_verified` server-side. */
export function updateMyPhone(phone: string) {
  return apiPatch<unknown>("/me/phone", { phone });
}

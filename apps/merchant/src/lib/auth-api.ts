import { apiDelete, apiGet, apiPost } from "./api.js";

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

/** Second half of a 2FA sign-in: the texted code (or a recovery code). */
export function completeTwoFactorChallenge(challengeId: string, code: string) {
  return apiPost<SignedIn & { used_recovery_code: boolean }>(
    "/auth/2fa/challenge",
    { challenge_id: challengeId, code },
    { auth: false },
  );
}

// --- 2FA (account settings) -----------------------------------------

export interface TwoFactorState {
  enabled: boolean;
  method: "sms" | null;
  masked_destination: string | null;
  enrolled_at: string | null;
  recovery_codes_remaining: number | null;
}

export function getTwoFactorState() {
  return apiGet<TwoFactorState>("/auth/2fa");
}

/** Enrolment step 1: choose the handset; the API texts it a code. */
export function enroll2fa(phone: string) {
  return apiPost<{ masked_destination: string; retry_after: number }>("/auth/2fa/enroll", { phone });
}

/** Enrolment step 2: the code from the text. Returns the ten recovery codes, once. */
export function verify2fa(code: string) {
  return apiPost<{ recovery_codes: string[] }>("/auth/2fa/verify", { code });
}

/** One-tap enable - uses the already-verified account phone. Returns the ten recovery codes, once. */
export function enable2fa() {
  return apiPost<{ recovery_codes: string[] }>("/auth/2fa/enable");
}

/** Raise a fresh challenge for an already-signed-in merchant (needed to disable). */
export function sendTwoFactorChallenge() {
  return apiPost<{ challenge_id: string; masked_destination: string; expires_in: number }>(
    "/auth/2fa/challenge/send",
  );
}

/** Switch off - password only; a texted/recovery `code` is still accepted if given. */
export function disable2fa(password: string, code?: string) {
  return apiDelete<void>("/auth/2fa", code ? { password, code } : { password });
}

// --- account deletion (30-day grace) -------------------------------

export function requestAccountDeletion() {
  return apiPost<{ status: string; deletion_scheduled_at: string }>("/auth/account/deletion");
}

export function cancelAccountDeletion() {
  return apiDelete<{ status: string }>("/auth/account/deletion");
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
 * onboarding - the phone at payout setup, where the reason for asking is
 * obvious - rather than gating the signup form behind an SMS.
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

export interface RegistrationState {
  full_name_present: boolean;
  phone_present: boolean;
  phone_verified: boolean;
  email_verified: boolean;
  terms_accepted: boolean;
  merchant_profile_required: boolean;
  merchant_profile_present: boolean;
}

/** What the onboarding checklist reads to know what's still outstanding. */
export function getRegistrationState() {
  return apiGet<RegistrationState>("/auth/registration-state");
}

/**
 * The frozen `/me` contract (identity.yaml) - used by onboarding to prefill
 * the email address collected at sign-up, so the "Your details" step
 * doesn't ask for it a second time.
 */
export function getMe() {
  return apiGet<{ id: string; email: string; phone: string | null; full_name: string | null }>("/me");
}

// --- forgot / reset password ------------------------------------------

/** Always emails a reset link - see the note on the server's forgotPassword. */
export function forgotPassword(email: string) {
  return apiPost<{ status: string; channel_hint: "email"; masked: string; retry_after: number }>(
    "/auth/password/forgot",
    { identifier: email },
    { auth: false },
  );
}

/** Revokes the current session (or every session, if `allDevices`). */
export function logout(allDevices = false) {
  return apiPost<void>("/auth/logout", { all_devices: allDevices });
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

// --- account settings: password + sessions ---------------------------

/** Authenticated change - revokes every other session, keeps the current one. */
export function changePassword(currentPassword: string, newPassword: string) {
  return apiPost<{ sessions_revoked: number }>("/auth/password/change", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export interface SessionRow {
  id: string;
  device: string;
  approximate_location: string | null;
  user_agent: string | null;
  last_seen_at: string;
  is_current: boolean;
}

export function listSessions() {
  return apiGet<{ data: SessionRow[]; next_cursor: string | null; has_more: boolean }>(
    "/auth/sessions",
  );
}

export function revokeSession(id: string) {
  return apiDelete<void>(`/auth/sessions/${id}`);
}

/** "Sign out everywhere" - all sessions but this one. */
export function revokeAllSessions() {
  return apiPost<{ revoked: number }>("/auth/sessions/revoke-all");
}

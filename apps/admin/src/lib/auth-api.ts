import { apiGet, apiPost } from "./api.js";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface TwoFactorRequired {
  challenge_token: string;
  next: "2fa";
  masked_destination: string;
  expires_in: number;
}

export type AdminRole = "admin_reviewer" | "admin_finance" | "admin_support" | "admin_super";

export interface AdminMe {
  id: string;
  email: string;
  full_name: string;
  role: AdminRole;
  assigned_queues: string[];
}

/** Step 1: email + password. Always returns a 2FA challenge, never tokens. */
export function adminLogin(email: string, password: string, deviceId: string) {
  return apiPost<TwoFactorRequired>(
    "/admin/auth/login",
    { email, password, device_id: deviceId },
    { auth: false },
  );
}

/** Step 2: the six-digit code texted to the admin's phone. */
export function adminVerifyTwoFactor(challengeToken: string, code: string) {
  return apiPost<TokenPair>(
    "/admin/auth/2fa",
    { challenge_token: challengeToken, code },
    { auth: false },
  );
}

export function getAdminMe() {
  return apiGet<AdminMe>("/admin/auth/me");
}

export function adminLogout() {
  return apiPost<void>("/admin/auth/logout");
}

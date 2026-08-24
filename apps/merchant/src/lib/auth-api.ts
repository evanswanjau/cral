import { apiPost } from "./api.js";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export function login(identifier: string, password: string, deviceId: string) {
  return apiPost<TokenPair & { user: unknown; next: string | null }>(
    "/auth/login",
    { identifier, password, device_id: deviceId },
    { auth: false },
  );
}

export function requestLoginOtp(identifier: string) {
  return apiPost<{ retry_after: number; masked_destination: string }>(
    "/auth/otp/request",
    { identifier, purpose: "login" },
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

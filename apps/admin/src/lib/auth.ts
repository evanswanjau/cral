import { useSyncExternalStore } from "react";
import { queryClient } from "./query-client.js";

/**
 * Client-side session storage for the Ops console.
 *
 * Admin uses a separate token audience (`aud: "ops"`, spec §8) and never
 * shares a storage key with the public apps. The pair lives in
 * `sessionStorage`, not `localStorage`: Ops machines are shared, and the
 * server enforces an 8-hour absolute cap and a 20-minute idle timeout
 * anyway, so there is nothing to gain from surviving a browser restart.
 * There is deliberately no "keep me signed in".
 */

const ACCESS_TOKEN_KEY = "cral_admin_access_token";
const REFRESH_TOKEN_KEY = "cral_admin_refresh_token";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getAccessTokenSnapshot(): string | null {
  return window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function useAccessToken(): string | null {
  return useSyncExternalStore(subscribe, getAccessTokenSnapshot, () => null);
}

export function useIsAuthenticated(): boolean {
  return useAccessToken() !== null;
}

export function getAccessToken(): string | null {
  return getAccessTokenSnapshot();
}

export function getRefreshToken(): string | null {
  return window.sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export interface AdminClaims {
  sub: string;
  role: "admin_reviewer" | "admin_finance" | "admin_support" | "admin_super";
}

/**
 * The `sub` and `role` claims read straight off the access token, for
 * client-side nav gating only. The payload is decoded without verifying the
 * signature — every request is validated server-side, so this is a UI
 * convenience, not a security check.
 */
export function getAdminClaims(): AdminClaims | null {
  const token = getAccessTokenSnapshot();
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(json) as { sub?: string; role?: AdminClaims["role"] };
    if (!parsed.sub || !parsed.role) return null;
    return { sub: parsed.sub, role: parsed.role };
  } catch {
    return null;
  }
}

function notify(): void {
  // useSyncExternalStore only re-renders on a "storage" event, which the
  // browser fires in *other* tabs - dispatch it here so this tab re-renders too.
  window.dispatchEvent(new StorageEvent("storage", { key: ACCESS_TOKEN_KEY }));
}

export function setSession(
  tokens: { access_token: string; refresh_token: string } | null,
): void {
  // Cached query data belongs to whoever was signed in a moment ago - clear
  // it on every session change so the next reviewer never hydrates against
  // the previous one's cache.
  queryClient.clear();

  if (tokens) {
    window.sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    window.sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  } else {
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }
  notify();
}

/** Updates just the token pair - used after a silent refresh. */
export function updateTokens(tokens: { access_token: string; refresh_token: string }): void {
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  window.sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  notify();
}

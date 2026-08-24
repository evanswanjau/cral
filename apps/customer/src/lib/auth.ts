import { useSyncExternalStore } from "react";

/**
 * Client-side session storage. Access tokens are short-lived (15 min per
 * spec §2) and refreshed via the rotating refresh-token flow (lib/api.ts
 * handles the actual 401-triggered refresh); both live in localStorage so
 * a refresh keeps the session rather than forcing a re-login.
 */

const ACCESS_TOKEN_KEY = "cral_customer_access_token";
const REFRESH_TOKEN_KEY = "cral_customer_refresh_token";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getAccessTokenSnapshot(): string | null {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function useAccessToken(): string | null {
  return useSyncExternalStore(subscribe, getAccessTokenSnapshot, () => null);
}

export function getAccessToken(): string | null {
  return getAccessTokenSnapshot();
}

export function useIsAuthenticated(): boolean {
  return useAccessToken() !== null;
}

export function getRefreshToken(): string | null {
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

function notify(key: string): void {
  // useSyncExternalStore only re-renders on a "storage" event, which the
  // browser fires in *other* tabs — dispatch it here too so the tab that
  // made the change also re-renders.
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

export function setAccessToken(token: string | null): void {
  if (token) window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  else window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  notify(ACCESS_TOKEN_KEY);
}

export function setSession(tokens: { access_token: string; refresh_token: string } | null): void {
  if (tokens) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
  notify(ACCESS_TOKEN_KEY);
}

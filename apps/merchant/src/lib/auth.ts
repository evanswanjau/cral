import { useSyncExternalStore } from "react";

/**
 * Client-side session storage. Access tokens are short-lived (15 min per
 * spec §2) and refreshed via the rotating refresh-token flow (lib/api.ts
 * handles the actual 401-triggered refresh).
 *
 * "Keep me signed in" on the sign-in screen decides *where* the pair is
 * kept: localStorage (survives closing the browser) when checked,
 * sessionStorage (cleared when the tab/browser closes) when not. The
 * REMEMBER_KEY flag in localStorage records which one to read from next
 * time the app loads, since that decision has to survive a full reload.
 */

const ACCESS_TOKEN_KEY = "cral_merchant_access_token";
const REFRESH_TOKEN_KEY = "cral_merchant_refresh_token";
const REMEMBER_KEY = "cral_merchant_remember_me";

function activeStorage(): Storage {
  return window.localStorage.getItem(REMEMBER_KEY) === "1" ? window.localStorage : window.sessionStorage;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getAccessTokenSnapshot(): string | null {
  return activeStorage().getItem(ACCESS_TOKEN_KEY);
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
  return activeStorage().getItem(REFRESH_TOKEN_KEY);
}

function notify(): void {
  // useSyncExternalStore only re-renders on a "storage" event, which the
  // browser fires in *other* tabs — dispatch it here too so the tab that
  // made the change also re-renders.
  window.dispatchEvent(new StorageEvent("storage", { key: ACCESS_TOKEN_KEY }));
}

export function setSession(
  tokens: { access_token: string; refresh_token: string } | null,
  remember = true,
): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);

  if (tokens) {
    if (remember) window.localStorage.setItem(REMEMBER_KEY, "1");
    else window.localStorage.removeItem(REMEMBER_KEY);

    const target = remember ? window.localStorage : window.sessionStorage;
    target.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    target.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  } else {
    window.localStorage.removeItem(REMEMBER_KEY);
  }

  notify();
}

/** Updates just the access/refresh pair in whichever storage is already active — used after a token refresh. */
export function updateTokens(tokens: { access_token: string; refresh_token: string }): void {
  const target = activeStorage();
  target.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  target.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  notify();
}

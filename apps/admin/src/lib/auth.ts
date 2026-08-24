import { useSyncExternalStore } from "react";

/**
 * Auth-aware layout groundwork for Phase 1. There is no login yet — this
 * only defines *how* a page will know whether someone is signed in once
 * /auth/login exists, so the layout wrapper doesn't need to change shape
 * when that lands. Access tokens are short-lived (15 min per spec §2) and
 * refreshed via the refresh-token rotation flow, not persisted long-term
 * client-side beyond this session store.
 */

// Admin uses a separate token audience (aud: "ops") from the public apps —
// spec §8 — so it never shares a token or storage key with them.
const STORAGE_KEY = "cral_admin_access_token";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

export function useAccessToken(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function useIsAuthenticated(): boolean {
  return useAccessToken() !== null;
}

export function setAccessToken(token: string | null): void {
  if (token) {
    window.localStorage.setItem(STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  // useSyncExternalStore only re-renders on a "storage" event, which the
  // browser fires in *other* tabs — dispatch it here too so the tab that
  // made the change also re-renders.
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
}

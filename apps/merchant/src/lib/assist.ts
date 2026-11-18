import { apiGet, apiPost } from "./api.js";
import { getAccessToken, setSession } from "./auth.js";
import type { OnboardingDraft } from "./onboarding-draft.js";

/**
 * Assist sessions (Phase 3, PR AG3). A CRAL sales agent, with the owner
 * beside them and the owner's SMS code as consent, gets a 1-hour token
 * that reaches onboarding only. The Ops console opens `/assist#token=...`
 * in a new tab; the fragment never reaches a server or a log.
 *
 * The server is the boundary (`apps/api/src/lib/assist.ts`): it refuses
 * everything outside onboarding, and the phone, payout and terms fields.
 * This file only keeps the wizard from trying.
 */

/** Takes the token out of the URL fragment and signs this tab in as the assist. */
export function takeAssistTokenFromFragment(): boolean {
  const match = /(?:^#|&)token=([^&]+)/.exec(window.location.hash);
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;
  // Gone from the address bar and history either way.
  window.history.replaceState(null, "", window.location.pathname);
  if (!token || !claimsOf(token)?.asb) return false;
  // Tab-only storage, no refresh token: when the hour is up, it's over.
  setSession({ access_token: token, refresh_token: "" }, false);
  return true;
}

function claimsOf(token: string): { sub?: string; asb?: string; exp?: number } | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      sub?: string;
      asb?: string;
      exp?: number;
    };
  } catch {
    return null;
  }
}

/** True when this tab is an agent's assist session. Display only: the server decides. */
export function isAssistSession(): boolean {
  const token = getAccessToken();
  return Boolean(token && claimsOf(token)?.asb);
}

/** Draft fields the wizard must not send in an assist: the owner's own acts. */
export const ASSIST_BLOCKED_DRAFT_KEYS: ReadonlyArray<keyof OnboardingDraft> = [
  "phone",
  "payoutSame",
  "payoutMethod",
  "payoutDetail",
  "bankName",
  "bankBranch",
  "bankAccountName",
  "bankAccountNumber",
  "termsAccepted",
];

export interface AssistInfo {
  account_email: string;
  assist: { agent_name: string; expires_at: string } | null;
  assists: { agent_name: string; started_at: string; ended_at: string | null; active: boolean }[];
}

export function fetchAssistInfo() {
  return apiGet<AssistInfo>("/merchant/onboarding");
}

/** Ends this assist (as the agent) or every live one (as the owner). */
export function endAssist() {
  return apiPost<{ ended: number }>("/merchant/onboarding/assist/end");
}

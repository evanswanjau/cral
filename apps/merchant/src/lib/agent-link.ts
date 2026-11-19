/**
 * A CRAL sales agent's personal sign-up link (Phase 3, PR AG2):
 * `/join?a=K7P2QX`, or `?a=` on any page an agent shares. The code is kept
 * here until the visitor creates an account, then sent with
 * `POST /auth/register` so the new merchant is credited to the agent. The
 * API ignores a code it doesn't know, so nothing here validates it beyond
 * its shape.
 *
 * localStorage, not sessionStorage: an owner often opens the link on
 * WhatsApp and signs up later in a fresh tab. It lapses after 30 days so
 * an old visit doesn't credit an agent for a sign-up months later.
 */
const KEY = "cral.merchant.agent";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SHAPE = /^[A-Za-z0-9]{6}$/;

export function rememberAgentCode(value: string | null): void {
  const code = value?.trim();
  if (!code || !SHAPE.test(code)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: code.toUpperCase(), at: Date.now() }));
  } catch {
    // Storage blocked: the sign-up just isn't credited.
  }
}

export function readAgentCode(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: unknown; at?: unknown };
    if (typeof parsed.code !== "string" || typeof parsed.at !== "number" || Date.now() - parsed.at > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return SHAPE.test(parsed.code) ? parsed.code : null;
  } catch {
    return null;
  }
}

/** After the account exists: the credit is fixed on the server, so the code has done its job. */
export function forgetAgentCode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

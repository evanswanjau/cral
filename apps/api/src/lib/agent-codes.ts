import { randomInt } from "node:crypto";
import type { Knex } from "knex";
import { db } from "../db/client.js";

/**
 * Sales agents' personal sign-up codes (Phase 3, PR AG2) - the `a` in
 * `<merchant portal>/join?a=K7P2QX`. See `openapi/admin-agents.yaml`.
 *
 * Six characters from an alphabet without 0/O or 1/I, so a code read out
 * over the phone or copied by hand survives. Stored upper-case and matched
 * case-insensitively. 32^6 is about a billion codes, so a collision on
 * issue is rare and simply retried against the unique index.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SIGNUP_CODE_LENGTH = 6;

/** Roles whose code credits a sign-up. The owner (`admin_super`) can sign people up too. */
const CREDITING_ROLES = ["admin_sales", "admin_super"] as const;

export function generateSignupCode(): string {
  let out = "";
  for (let i = 0; i < SIGNUP_CODE_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Upper-cased and trimmed, or null when it can't be a code at all. */
export function normalizeSignupCode(raw: string | null | undefined): string | null {
  const code = raw?.trim().toUpperCase() ?? "";
  if (code.length !== SIGNUP_CODE_LENGTH) return null;
  for (const c of code) if (!ALPHABET.includes(c)) return null;
  return code;
}

/**
 * The admin a code credits, or null for an unknown code, a disabled admin,
 * or one whose role can't sign merchants up. Null is never an error: a
 * stale or mistyped link must not stop an owner from signing up.
 */
export async function resolveSignupCode(
  raw: string | null | undefined,
  trx: Knex | Knex.Transaction = db,
): Promise<{ id: string } | null> {
  const code = normalizeSignupCode(raw);
  if (!code) return null;
  const row = (await trx("admin_users")
    .where({ signup_code: code, status: "active" })
    .whereIn("role", [...CREDITING_ROLES])
    .first("id")) as { id: string } | undefined;
  return row ?? null;
}

export function signupLink(code: string): string {
  const base = (process.env.MERCHANT_APP_URL ?? "http://localhost:5174").replace(/\/+$/, "");
  return `${base}/join?a=${code}`;
}

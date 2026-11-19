import { randomBytes } from "node:crypto";
import type { Knex } from "knex";
import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { hashPassword } from "../../lib/password.js";
import { normalizePhone } from "../../lib/identifier.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { decodeCursor, encodeCursor } from "../../lib/pagination.js";
import { isUniqueViolation } from "../../lib/pg-errors.js";
import { maskIdentifier } from "../../lib/mask.js";
import { emailAdapter } from "../../lib/adapters.js";
import {
  emailButton,
  emailHeading,
  emailLayout,
  emailMuted,
  emailParagraph,
  escapeHtml,
} from "../../lib/email-templates.js";
import type { AdminRole } from "../../lib/jwt.js";
import {
  INVITE_TOKEN_TTL_DAYS,
  isInvitePending,
  issueInviteToken,
  merchantInviteLink,
} from "../auth/service.js";
import type { UserRow } from "../auth/db-types.js";
import type { AdminUserRow } from "../admin-auth/db-types.js";
import { generateSignupCode, signupLink } from "../../lib/agent-codes.js";
import type { MerchantRow } from "../merchant/db-types.js";
import type { AddMerchantInput } from "./schemas.js";

/**
 * Sales agents' two screens (Phase 3, PR AG1) - see `openapi/admin-agents.yaml`.
 *
 * Every read and write here is scoped by `merchants.onboarded_by`: an agent
 * sees and touches only the merchants it brought in, `admin_super` sees
 * all of them. Nothing in this module can approve anything - it never
 * writes `approved_at`, a document's `review_state` or a vehicle's status.
 */
export interface AgentCtx {
  adminId: string;
  adminName: string;
  role: AdminRole;
  ip: string | null;
  requestId: string | null;
}

export type AgentMerchantStatus = "invited" | "onboarding" | "submitted" | "changes_requested" | "verified";

/** The merchant portal's wizard (`apps/merchant/src/pages/Onboarding.tsx`'s STEPS). */
const WIZARD_STEPS: Record<number, string> = {
  1: "Welcome",
  2: "Your details",
  3: "Vehicles",
  4: "Documents",
  5: "Review",
};
const WIZARD_STEP_COUNT = 5;

export interface Joined {
  id: string;
  user_id: string;
  owner_type: string;
  company_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  surname: string | null;
  onboarding_max_step: number;
  onboarding_submitted: boolean;
  approved_at: Date | null;
  review_changes_requested_at: Date | null;
  onboarded_by: string | null;
  onboarding_source: string;
  last_activity_at: Date;
  created_at: Date;
  email: string;
  phone: string | null;
  full_name: string | null;
  invited_at: Date | null;
  invite_accepted_at: Date | null;
  phone_verified: boolean;
  user_status: string;
  agent_name: string | null;
}

const COLUMNS = [
  "m.id",
  "m.user_id",
  "m.owner_type",
  "m.company_name",
  "m.first_name",
  "m.middle_name",
  "m.surname",
  "m.onboarding_max_step",
  "m.onboarding_submitted",
  "m.approved_at",
  "m.review_changes_requested_at",
  "m.onboarded_by",
  "m.onboarding_source",
  "m.last_activity_at",
  "m.created_at",
  "u.email",
  "u.phone",
  "u.full_name",
  "u.invited_at",
  "u.invite_accepted_at",
  "u.phone_verified",
  "u.status as user_status",
  "a.full_name as agent_name",
];

/** `onboarded_by = me` for an agent; every agent-brought merchant for `admin_super`. */
function scoped(ctx: AgentCtx): Knex.QueryBuilder {
  const q = db("merchants as m")
    .join("users as u", "u.id", "m.user_id")
    .leftJoin("admin_users as a", "a.id", "m.onboarded_by");
  if (ctx.role === "admin_super") q.whereNotNull("m.onboarded_by");
  else q.where("m.onboarded_by", ctx.adminId);
  return q;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Name (person or company), email, or phone. Digits match the phone
 * anywhere once the country code / leading 0 is dropped, so "0712 345",
 * "712345" and "+254712345" all find +254712345678.
 */
function applySearch(q: Knex.QueryBuilder, raw: string | undefined): void {
  const term = raw?.trim();
  if (!term) return;
  const like = `%${escapeLike(term)}%`;
  const digits = term.replace(/\D/g, "");
  const core = digits.replace(/^254/, "").replace(/^0/, "");

  q.where((w) => {
    w.whereRaw("u.full_name ILIKE ?", [like])
      .orWhereRaw("m.company_name ILIKE ?", [like])
      .orWhereRaw("concat_ws(' ', m.first_name, m.middle_name, m.surname) ILIKE ?", [like])
      .orWhereRaw("u.email ILIKE ?", [like]);
    if (core.length >= 3) w.orWhere("u.phone", "like", `%${core}%`);
  });
}

function statusOf(r: Joined): AgentMerchantStatus {
  if (r.approved_at) return "verified";
  if (r.review_changes_requested_at) return "changes_requested";
  if (r.onboarding_submitted) return "submitted";
  // Still waiting on the owner to set a password, and nothing filled in.
  if (isInvitePending(r) && r.onboarding_max_step <= 1) return "invited";
  return "onboarding";
}

function displayName(r: Joined): string | null {
  const person =
    [r.first_name, r.middle_name, r.surname].filter((p): p is string => Boolean(p?.trim())).join(" ") ||
    r.full_name;
  return r.owner_type === "company" ? (r.company_name ?? person) : person;
}

function serialize(r: Joined) {
  const step = Math.min(Math.max(r.onboarding_max_step, 1), WIZARD_STEP_COUNT);
  return {
    id: r.id,
    owner_type: r.owner_type,
    name: displayName(r),
    email: r.email,
    phone: r.phone,
    status: statusOf(r),
    onboarding: { step, of: WIZARD_STEP_COUNT, label: WIZARD_STEPS[step] ?? "Onboarding" },
    invite_pending: isInvitePending(r),
    // PR AG3: "Fill in onboarding" can start (see ./assist.ts).
    assist_ready: !r.onboarding_submitted && r.user_status === "active" && r.phone_verified && Boolean(r.phone),
    invited_at: r.invited_at ? r.invited_at.toISOString() : null,
    onboarding_source: r.onboarding_source,
    agent: r.onboarded_by ? { id: r.onboarded_by, name: r.agent_name ?? "" } : null,
    created_at: r.created_at.toISOString(),
    last_activity_at: r.last_activity_at.toISOString(),
  };
}

export type AgentMerchant = ReturnType<typeof serialize>;

function merchantNotFound(): ApiError {
  return new ApiError({
    status: 404,
    type: "not_found",
    code: "merchant_not_found",
    message: "That merchant isn't one you brought in.",
  });
}

export async function loadScoped(merchantId: string, ctx: AgentCtx): Promise<Joined> {
  const row = (await scoped(ctx).where("m.id", merchantId).first(COLUMNS)) as Joined | undefined;
  if (!row) throw merchantNotFound();
  return row;
}

// ---------------------------------------------------------------------
// My merchants
// ---------------------------------------------------------------------

/**
 * Newest first. Keyset on the merchant id alone: ids are ULIDs, so their
 * order is creation order, and a single unique key can't skip or repeat a
 * row the way a millisecond-rounded timestamp cursor can.
 */
export async function listAgentMerchants(
  ctx: AgentCtx,
  params: { q?: string | undefined; cursor?: string | undefined; limit: number },
) {
  const base = scoped(ctx);
  applySearch(base, params.q);

  const countRow = (await base.clone().clearSelect().count<{ count: string }[]>({ count: "m.id" }))[0];
  const total = Number(countRow?.count ?? 0);

  const page = base.clone().select(COLUMNS);
  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (decoded) page.where("m.id", "<", decoded.id);
  }
  const rows = (await page.orderBy("m.id", "desc").limit(params.limit + 1)) as Joined[];

  const has_more = rows.length > params.limit;
  const data = (has_more ? rows.slice(0, params.limit) : rows).map(serialize);
  const last = data.at(-1);
  return {
    data,
    next_cursor: has_more && last ? encodeCursor({ v: last.id, id: last.id }) : null,
    has_more,
    total,
  };
}

// ---------------------------------------------------------------------
// Add merchant + invite
// ---------------------------------------------------------------------

function accountExists(field: "email" | "phone"): ApiError {
  return new ApiError({
    status: 409,
    type: "conflict",
    code: "account_exists",
    message:
      field === "phone"
        ? "That phone number is already on a CRAL account. Ask the owner to sign in and start onboarding themselves."
        : "That email already has a CRAL account. Ask the owner to sign in and start onboarding themselves.",
    field,
  });
}

/** "Jane Wanjiru Kamau" -> first / middle / surname, for onboarding to pre-fill. The owner can correct it there. */
function splitName(name: string): { first_name: string; middle_name: string | null; surname: string | null } {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? name.trim();
  if (parts.length === 1) return { first_name: first, middle_name: null, surname: null };
  return {
    first_name: first,
    middle_name: parts.slice(1, -1).join(" ") || null,
    surname: parts.at(-1) ?? null,
  };
}

/**
 * Sends the set-your-password email. Runs after the commit and never
 * throws: a refused email must not undo the account, and the agent is told
 * (`invite_sent: false`) so they can resend.
 */
async function sendInviteEmail(
  to: string,
  agentName: string,
  ownerName: string,
  rawToken: string,
): Promise<boolean> {
  const link = merchantInviteLink(rawToken);
  const agentFirst = agentName.trim().split(/\s+/)[0] || "Your CRAL agent";
  const lede = `${agentFirst} from CRAL started a merchant account for ${ownerName}. Set a password to finish setting up: add your details, your vehicles or drivers and your documents, then send it to us for review.`;
  const small = `This link works for ${INVITE_TOKEN_TTL_DAYS} days. Only you can set your password - nobody from CRAL will ever ask you for it. If you weren't expecting this, you can ignore this email.`;
  try {
    await emailAdapter.send({
      to,
      subject: "Set your password and finish setting up",
      html: emailLayout({
        preheader: "Your CRAL merchant account is ready for you to finish",
        bodyHtml: [
          emailHeading("Finish setting up your CRAL account"),
          emailParagraph(escapeHtml(lede)),
          emailButton("Set your password", link),
          emailMuted(escapeHtml(small)),
        ].join(""),
      }),
      text: `${lede}\n\nSet your password: ${link}\n\n${small}`,
    });
    return true;
  } catch (err) {
    console.error(`[admin-agents] invite email to ${maskIdentifier(to)} failed:`, err);
    return false;
  }
}

export async function addMerchant(input: AddMerchantInput, ctx: AgentCtx) {
  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "invalid_phone",
      message: "That doesn't look like a valid Kenyan mobile number.",
      field: "phone",
    });
  }
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim().replace(/\s+/g, " ");
  const isCompany = input.owner_type === "company";

  const clash = await db<UserRow>("users").where({ email }).orWhere({ phone }).first();
  if (clash) throw accountExists(clash.email === email ? "email" : "phone");

  const userId = generateId("user");
  const merchantId = generateId("merchant");
  // Nobody knows this password, the agent included. It only exists so the
  // NOT NULL column has a real argon2 hash that no input can match; the
  // owner replaces it from the emailed link.
  const unusablePassword = await hashPassword(randomBytes(32).toString("base64url"));

  let rawToken: string;
  try {
    rawToken = await db.transaction(async (trx) => {
      const now = new Date();
      await trx<UserRow>("users").insert({
        id: userId,
        email,
        phone,
        full_name: isCompany ? null : name,
        password_hash: unusablePassword,
        roles: ["merchant"],
        invited_at: now,
      });
      await trx<MerchantRow>("merchants").insert({
        id: merchantId,
        user_id: userId,
        owner_type: input.owner_type,
        ...(isCompany ? { company_name: name, payout_method: "bank" } : splitName(name)),
        onboarded_by: ctx.adminId,
        onboarding_source: "agent_invite",
      });
      const token = await issueInviteToken(trx, userId);
      await writeAuditEntry(trx, {
        actorId: ctx.adminId,
        actorType: "admin",
        action: "merchant.agent_invite",
        entityType: "merchant",
        entityId: merchantId,
        after: {
          user_id: userId,
          owner_type: input.owner_type,
          email,
          phone,
          onboarded_by: ctx.adminId,
          onboarding_source: "agent_invite",
        },
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
      return token;
    });
  } catch (err) {
    // Two agents adding the same owner at once: the check above passed for
    // both, and the unique index is what stops the second.
    if (isUniqueViolation(err)) {
      const again = await db<UserRow>("users").where({ email }).first();
      throw accountExists(again ? "email" : "phone");
    }
    throw err;
  }

  const inviteSent = await sendInviteEmail(email, ctx.adminName, name, rawToken);
  return { merchant: serialize(await loadScoped(merchantId, ctx)), invite_sent: inviteSent };
}

export async function resendInvite(merchantId: string, ctx: AgentCtx) {
  const row = await loadScoped(merchantId, ctx);
  if (!isInvitePending(row)) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "invite_already_accepted",
      message: "They've already set a password. If they've forgotten it, they can use Forgot password.",
    });
  }

  const rawToken = await db.transaction(async (trx) => {
    await trx<UserRow>("users").where({ id: row.user_id }).update({ invited_at: new Date() });
    const token = await issueInviteToken(trx, row.user_id);
    await writeAuditEntry(trx, {
      actorId: ctx.adminId,
      actorType: "admin",
      action: "merchant.invite_resent",
      entityType: "merchant",
      entityId: row.id,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
    return token;
  });

  const inviteSent = await sendInviteEmail(row.email, ctx.adminName, displayName(row) ?? row.email, rawToken);
  return { merchant: serialize(await loadScoped(merchantId, ctx)), invite_sent: inviteSent };
}

// ---------------------------------------------------------------------
// Personal sign-up link (PR AG2)
// ---------------------------------------------------------------------

/**
 * The caller's code and link, issuing the code on first use. The write is
 * conditional on `signup_code IS NULL`, so two tabs opening My merchants
 * at once can't hand out two codes: the loser re-reads the winner's.
 */
export async function getSignupLink(ctx: AgentCtx): Promise<{ code: string; url: string }> {
  const existing = await db<AdminUserRow>("admin_users").where({ id: ctx.adminId }).first("signup_code");
  if (existing?.signup_code) return { code: existing.signup_code, url: signupLink(existing.signup_code) };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateSignupCode();
    try {
      const issued = await db.transaction(async (trx) => {
        const n = await trx<AdminUserRow>("admin_users")
          .where({ id: ctx.adminId })
          .whereNull("signup_code")
          .update({ signup_code: code, updated_at: new Date() });
        if (n === 0) return false;
        await writeAuditEntry(trx, {
          actorId: ctx.adminId,
          actorType: "admin",
          action: "admin.signup_code_issued",
          entityType: "admin_user",
          entityId: ctx.adminId,
          after: { signup_code: code },
          requestId: ctx.requestId,
          ip: ctx.ip,
        });
        return true;
      });
      if (!issued) break; // Someone else issued it first; read theirs.
      return { code, url: signupLink(code) };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Another agent already holds this code. Draw again.
    }
  }

  const row = await db<AdminUserRow>("admin_users").where({ id: ctx.adminId }).first("signup_code");
  if (!row?.signup_code) throw new Error("Could not issue a sign-up code");
  return { code: row.signup_code, url: signupLink(row.signup_code) };
}

/** Every sales agent, for Ops Merchants' agent filter (`admin_super` only). */
export async function listAgents() {
  const rows = (await db("admin_users as a")
    .leftJoin("merchants as m", "m.onboarded_by", "a.id")
    .where("a.role", "admin_sales")
    .groupBy("a.id", "a.full_name", "a.status")
    .orderBy("a.full_name", "asc")
    .orderBy("a.id", "asc")
    .select("a.id", "a.full_name", "a.status")
    .count<{ id: string; full_name: string; status: string; merchants: string }[]>({ merchants: "m.id" })) as {
    id: string;
    full_name: string;
    status: string;
    merchants: string | number;
  }[];
  return {
    data: rows.map((r) => ({
      id: r.id,
      name: r.full_name,
      status: r.status === "disabled" ? "disabled" : "active",
      merchants: Number(r.merchants),
    })),
  };
}

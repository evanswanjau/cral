import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { maskIdentifier } from "../../lib/mask.js";
import { emailAdapter, smsAdapter } from "../../lib/adapters.js";
import { generateOtpCode, hashCode } from "../../lib/otp.js";
import { generateOpaqueToken, hashToken } from "../../lib/tokens.js";
import { signAssistAccessToken } from "../../lib/jwt.js";
import {
  ASSIST_CODE_MAX_ATTEMPTS,
  ASSIST_CODE_TTL_SECONDS,
  ASSIST_TTL_SECONDS,
  onboardingSubmittedError,
} from "../../lib/assist.js";
import {
  emailButton,
  emailHeading,
  emailLayout,
  emailMuted,
  emailParagraph,
  escapeHtml,
} from "../../lib/email-templates.js";
import type { SessionRow, UserRow } from "../auth/db-types.js";
import { loadScoped, type AgentCtx, type Joined } from "./service.js";

/**
 * Assist session (Phase 3, PR AG3; `docs/plans/trucks-and-sales-agents.md`
 * B3, "B3 as built"). A sales agent fills in onboarding for the owner, who
 * is beside them and reads out a code we text to their verified phone.
 * What the resulting token may reach is enforced in `authenticate()` from
 * `lib/assist.ts`; this file only starts it.
 */

function merchantPortal(): string {
  return (process.env.MERCHANT_APP_URL ?? "http://localhost:5174").replace(/\/+$/, "");
}

function firstName(name: string, fallback: string): string {
  return name.trim().split(/\s+/)[0] || fallback;
}

function assertAssistable(r: Joined): void {
  if (r.onboarding_submitted) throw onboardingSubmittedError();
  if (r.user_status !== "active") {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "account_inactive",
      message: "This account isn't active, so nobody can fill it in.",
    });
  }
  // The code must reach a number the owner proved is theirs, never one only
  // the agent has typed: an agent who could consent for the owner could
  // also point the payouts at themselves.
  if (!r.phone || !r.phone_verified) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "phone_not_verified",
      message:
        "The owner hasn't verified their phone yet. They do that in onboarding (Your details), then you can help with the rest.",
    });
  }
}

function codeExpired(): ApiError {
  return new ApiError({
    status: 410,
    type: "conflict",
    code: "otp_expired",
    message: "That code has expired or was already used. Send a new one.",
  });
}

interface ChallengeRow {
  id: string;
  merchant_id: string;
  admin_user_id: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
}

/** Texts the owner a consent code naming the agent. Only its hash is stored. */
export async function startAssist(merchantId: string, ctx: AgentCtx) {
  const row = await loadScoped(merchantId, ctx);
  assertAssistable(row);
  const phone = row.phone as string;

  const code = generateOtpCode();
  const challengeId = generateId("assistChallenge");
  const now = new Date();
  await db.transaction(async (trx) => {
    // One live code per agent and merchant: an older one stops working.
    await trx("assist_challenges")
      .where({ merchant_id: row.id, admin_user_id: ctx.adminId })
      .whereNull("consumed_at")
      .update({ consumed_at: now, updated_at: now });
    await trx("assist_challenges").insert({
      id: challengeId,
      merchant_id: row.id,
      admin_user_id: ctx.adminId,
      code_hash: hashCode(code),
      expires_at: new Date(now.getTime() + ASSIST_CODE_TTL_SECONDS * 1000),
    });
    await writeAuditEntry(trx, {
      actorId: ctx.adminId,
      actorType: "admin",
      action: "merchant.assist_code_sent",
      entityType: "merchant",
      entityId: row.id,
      after: { challenge_id: challengeId, assisted_for: row.user_id },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  const agent = firstName(ctx.adminName, "A CRAL agent");
  const minutes = ASSIST_CODE_TTL_SECONDS / 60;
  const body = `${agent} from CRAL wants to fill in your CRAL account setup with you. Code: ${code}. Only read it out to them in person. It expires in ${minutes} minutes.`;
  try {
    await smsAdapter.send({ to: phone, body });
  } catch (err) {
    console.error(`[admin-agents] assist code to ${maskIdentifier(phone)} failed:`, err);
    // A code that never arrived can't be used; void it.
    await db("assist_challenges")
      .where({ id: challengeId })
      .whereNull("consumed_at")
      .update({ consumed_at: new Date(), updated_at: new Date() });
    throw new ApiError({
      status: 503,
      type: "server_error",
      code: "sms_send_failed",
      message: "We couldn't send the code by SMS just now. Please try again in a moment.",
    });
  }

  return {
    challenge_id: challengeId,
    masked_destination: maskIdentifier(phone),
    expires_in: ASSIST_CODE_TTL_SECONDS,
  };
}

/** Tells the owner, by email, that an agent is in their setup and how to end it. Never throws. */
async function sendAssistStartedEmail(to: string, agentName: string): Promise<void> {
  const agent = firstName(agentName, "A CRAL agent");
  const lede = `${agent} from CRAL started filling in your CRAL account setup with you, using the code we texted you. They can add your details, vehicles and documents. They can't send it for review, accept the terms, or change your phone or payout details: those stay with you.`;
  const small =
    "Their access ends on its own within an hour. To end it now, sign in and choose End agent access on your setup page. If you didn't give anyone a code, end it now and tell us.";
  const link = `${merchantPortal()}/onboarding`;
  try {
    await emailAdapter.send({
      to,
      subject: `${agent} from CRAL is filling in your setup`,
      html: emailLayout({
        preheader: "A CRAL agent is helping you set up your account",
        bodyHtml: [
          emailHeading("A CRAL agent is helping you"),
          emailParagraph(escapeHtml(lede)),
          emailButton("Open your setup", link),
          emailMuted(escapeHtml(small)),
        ].join(""),
      }),
      text: `${lede}\n\nOpen your setup: ${link}\n\n${small}`,
    });
  } catch (err) {
    console.error(`[admin-agents] assist notice to ${maskIdentifier(to)} failed:`, err);
  }
}

/**
 * Exchanges the owner's code for an assist token. The code is spent by a
 * conditional update, so it works once; the session row is what
 * `authenticate()` reads to keep the token inside onboarding.
 */
export async function confirmAssist(
  merchantId: string,
  input: { challenge_id: string; code: string },
  ctx: AgentCtx,
) {
  const row = await loadScoped(merchantId, ctx);
  assertAssistable(row);

  const challenge = (await db("assist_challenges")
    .where({ id: input.challenge_id, merchant_id: row.id, admin_user_id: ctx.adminId })
    .first()) as ChallengeRow | undefined;
  if (
    !challenge ||
    challenge.consumed_at !== null ||
    challenge.expires_at < new Date() ||
    challenge.attempts >= ASSIST_CODE_MAX_ATTEMPTS
  ) {
    throw codeExpired();
  }
  if (hashCode(input.code.trim()) !== challenge.code_hash) {
    await db("assist_challenges").where({ id: challenge.id }).increment("attempts", 1);
    throw new ApiError({
      status: 401,
      type: "auth_error",
      code: "otp_incorrect",
      message: "That code is incorrect.",
      field: "code",
    });
  }

  const user = await db<UserRow>("users").where({ id: row.user_id }).first();
  if (!user) throw new Error("Merchant without a user row");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ASSIST_TTL_SECONDS * 1000);
  const sessionId = generateId("session");

  await db.transaction(async (trx) => {
    const spent = await trx("assist_challenges")
      .where({ id: challenge.id })
      .whereNull("consumed_at")
      .where("attempts", "<", ASSIST_CODE_MAX_ATTEMPTS)
      .update({ consumed_at: now, updated_at: now });
    if (spent === 0) throw codeExpired();

    // One live assist per agent and owner.
    await trx<SessionRow>("sessions")
      .where({ user_id: row.user_id, kind: "assist", assisted_by: ctx.adminId })
      .whereNull("revoked_at")
      .update({ revoked_at: now, revoked_reason: "assist_replaced" });

    await trx<SessionRow>("sessions").insert({
      id: sessionId,
      user_id: row.user_id,
      device_id: "assist",
      device_label: `Assist by ${ctx.adminName}`.slice(0, 200),
      ip: ctx.ip,
      // No refresh token is ever issued; this hashes bytes nobody keeps.
      token_hash: hashToken(generateOpaqueToken()),
      expires_at: expiresAt,
      last_seen_at: now,
      kind: "assist",
      assisted_by: ctx.adminId,
    });
    await writeAuditEntry(trx, {
      actorId: ctx.adminId,
      actorType: "admin",
      action: "merchant.assist_started",
      entityType: "merchant",
      entityId: row.id,
      after: { session_id: sessionId, assisted_for: row.user_id, expires_at: expiresAt.toISOString() },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  const accessToken = signAssistAccessToken(
    { sub: row.user_id, sid: sessionId, roles: user.roles, asb: ctx.adminId },
    ASSIST_TTL_SECONDS,
  );
  await sendAssistStartedEmail(row.email, ctx.adminName);

  return {
    access_token: accessToken,
    expires_at: expiresAt.toISOString(),
    // The fragment never reaches a server or an access log.
    portal_url: `${merchantPortal()}/assist#token=${accessToken}`,
  };
}

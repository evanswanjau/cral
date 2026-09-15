import { randomBytes } from "node:crypto";
import { ApiError, type PaginatedResult } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { hashPassword } from "../../lib/password.js";
import { normalizePhone } from "../../lib/identifier.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import type { AdminSessionRow, AdminUserRow } from "../admin-auth/db-types.js";
import type { AdminRole } from "../../lib/jwt.js";

export interface AdminCtx {
  adminId: string;
  ip: string | null;
  requestId: string | null;
}

/**
 * Everything a Team-screen row needs. Never carries `password_hash`.
 */
function serialize(admin: AdminUserRow) {
  return {
    id: admin.id,
    email: admin.email,
    phone: admin.phone,
    full_name: admin.full_name,
    role: admin.role,
    assigned_queues: admin.assigned_queues,
    status: admin.status,
    last_login_at: admin.last_login_at ? admin.last_login_at.toISOString() : null,
    created_at: admin.created_at.toISOString(),
  };
}

function notFound(): ApiError {
  return new ApiError({
    status: 404,
    type: "not_found",
    code: "admin_not_found",
    message: "That admin account no longer exists.",
  });
}

/** A generated credential is 24 base64url characters — same as `create-admin.ts`. */
function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

/** `admin_super` sees every queue, so it's stored with none assigned. */
function normalizeQueues(role: AdminRole, queues: string[]): string[] {
  return role === "admin_super" ? [] : queues;
}

export async function listAdmins(cursor: string | undefined, limit: number) {
  const rows = await applyCursor(db<AdminUserRow>("admin_users"), {
    sortColumn: "created_at",
    direction: "desc",
    limit,
    ...(cursor ? { cursor } : {}),
  });
  const page: PaginatedResult<AdminUserRow> = toPaginatedResult(rows, limit, "created_at");
  return { data: page.data.map(serialize), next_cursor: page.next_cursor, has_more: page.has_more };
}

/**
 * Mirrors `scripts/create-admin.ts` exactly — same uniqueness check, same
 * generated-password shape — so a super admin doing this from the console
 * gets identical behaviour to the bootstrap CLI. The password is returned
 * once and is not recoverable; it is never stored anywhere but the hash.
 */
export async function createAdmin(
  input: { email: string; phone: string; full_name: string; role: AdminRole; queues: string[] },
  ctx: AdminCtx,
) {
  const email = input.email.trim().toLowerCase();
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

  const existing = await db<AdminUserRow>("admin_users").where({ email }).first();
  if (existing) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "admin_email_taken",
      message: "An admin with that email already exists.",
      field: "email",
    });
  }

  const password = generatePassword();
  const id = generateId("adminUser");

  await db.transaction(async (trx) => {
    await trx<AdminUserRow>("admin_users").insert({
      id,
      email,
      password_hash: await hashPassword(password),
      phone,
      full_name: input.full_name.trim(),
      role: input.role,
      assigned_queues: normalizeQueues(input.role, input.queues),
    });
    await writeAuditEntry(trx, {
      actorId: ctx.adminId,
      actorType: "admin",
      action: "admin.create",
      entityType: "admin_user",
      entityId: id,
      after: { email, role: input.role, queues: normalizeQueues(input.role, input.queues) },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  const created = await db<AdminUserRow>("admin_users").where({ id }).first();
  return { admin: serialize(created!), password };
}

async function requireTarget(id: string): Promise<AdminUserRow> {
  const admin = await db<AdminUserRow>("admin_users").where({ id }).first();
  if (!admin) throw notFound();
  return admin;
}

function assertNotSelf(ctx: AdminCtx, targetId: string, code: string, message: string): void {
  if (ctx.adminId === targetId) {
    throw new ApiError({ status: 422, type: "validation_error", code, message });
  }
}

/** Role + queue re-assignment. An admin can't change their own role — same
 * "no self-edit" rule as `DELETE /auth/2fa` refusing to let an account
 * disable its own second factor unattended. */
export async function updateAdmin(
  targetId: string,
  input: { role: AdminRole; queues: string[] },
  ctx: AdminCtx,
) {
  assertNotSelf(
    ctx,
    targetId,
    "cannot_edit_own_role",
    "You can't change your own role or queues. Ask another owner.",
  );
  const before = await requireTarget(targetId);
  const queues = normalizeQueues(input.role, input.queues);

  await db.transaction(async (trx) => {
    await trx<AdminUserRow>("admin_users")
      .where({ id: targetId })
      .update({ role: input.role, assigned_queues: queues });
    await writeAuditEntry(trx, {
      actorId: ctx.adminId,
      actorType: "admin",
      action: "admin.update_role",
      entityType: "admin_user",
      entityId: targetId,
      before: { role: before.role, queues: before.assigned_queues },
      after: { role: input.role, queues },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  return serialize((await db<AdminUserRow>("admin_users").where({ id: targetId }).first())!);
}

/** Deactivating revokes every live session so it takes effect immediately,
 * the same rule the reliability patch applied to merchant sessions — a
 * disabled admin must not keep working until an access token expires. */
export async function deactivateAdmin(targetId: string, ctx: AdminCtx) {
  assertNotSelf(
    ctx,
    targetId,
    "cannot_deactivate_self",
    "You can't deactivate your own account. Ask another owner.",
  );
  const admin = await requireTarget(targetId);

  if (admin.status !== "disabled") {
    await db.transaction(async (trx) => {
      await trx<AdminUserRow>("admin_users").where({ id: targetId }).update({ status: "disabled" });
      await trx<AdminSessionRow>("admin_sessions")
        .where({ admin_user_id: targetId, revoked_at: null })
        .update({ revoked_at: new Date(), revoked_reason: "admin_disabled" });
      await writeAuditEntry(trx, {
        actorId: ctx.adminId,
        actorType: "admin",
        action: "admin.deactivate",
        entityType: "admin_user",
        entityId: targetId,
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
    });
  }

  return serialize((await db<AdminUserRow>("admin_users").where({ id: targetId }).first())!);
}

export async function reactivateAdmin(targetId: string, ctx: AdminCtx) {
  const admin = await requireTarget(targetId);

  if (admin.status !== "active") {
    await db.transaction(async (trx) => {
      await trx<AdminUserRow>("admin_users").where({ id: targetId }).update({ status: "active" });
      await writeAuditEntry(trx, {
        actorId: ctx.adminId,
        actorType: "admin",
        action: "admin.reactivate",
        entityType: "admin_user",
        entityId: targetId,
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
    });
  }

  return serialize((await db<AdminUserRow>("admin_users").where({ id: targetId }).first())!);
}

/**
 * Regenerates the account's password and revokes every session, same as
 * `resetPassword` does for a public-side user. Named `reset-invite` to fill
 * the fallback route `auth/routes.ts` reserved before Phase 3 built this —
 * there's no email-invite link, since the console picked "generated
 * password, shown once" over a tokenized invite (2026-09-15).
 */
export async function resetAdminPassword(targetId: string, ctx: AdminCtx) {
  await requireTarget(targetId);
  const password = generatePassword();

  await db.transaction(async (trx) => {
    await trx<AdminUserRow>("admin_users")
      .where({ id: targetId })
      .update({ password_hash: await hashPassword(password) });
    await trx<AdminSessionRow>("admin_sessions")
      .where({ admin_user_id: targetId, revoked_at: null })
      .update({ revoked_at: new Date(), revoked_reason: "password_reset" });
    await writeAuditEntry(trx, {
      actorId: ctx.adminId,
      actorType: "admin",
      action: "admin.reset_password",
      entityType: "admin_user",
      entityId: targetId,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  return { password };
}

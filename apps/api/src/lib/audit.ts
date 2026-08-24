import type { Knex } from "knex";
import { generateId } from "./ids.js";

export interface AuditEntryInput {
  actorId: string | null;
  actorType: "user" | "admin" | "system";
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ip?: string | null;
}

/**
 * Writes an audit_log row. Pass a transaction (`trx`) whenever the write
 * accompanies a state change — spec §23 requires the audit row land in the
 * *same transaction* as the change, never as a follow-up step.
 */
export async function writeAuditEntry(trx: Knex.Transaction | Knex, entry: AuditEntryInput): Promise<void> {
  await trx("audit_log").insert({
    id: generateId("auditLog"),
    actor_id: entry.actorId,
    actor_type: entry.actorType,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    before: entry.before ? JSON.stringify(entry.before) : null,
    after: entry.after ? JSON.stringify(entry.after) : null,
    request_id: entry.requestId ?? null,
    ip: entry.ip ?? null,
  });
}

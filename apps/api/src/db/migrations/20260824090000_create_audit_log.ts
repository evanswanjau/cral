import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Permanent, append-only record of every state-changing action. Every
 * admin/state-changing action must write a row here IN THE SAME TRANSACTION
 * as the change it records — never as a follow-up step. See spec §23/§27.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("audit_log", (table) => {
    addId(table);

    table.string("actor_id", 34).nullable(); // null for system-initiated actions
    table.string("actor_type", 20).notNullable(); // "user" | "admin" | "system"
    table.string("action", 100).notNullable(); // e.g. "vehicle.approved"
    table.string("entity_type", 40).notNullable(); // e.g. "vehicle"
    table.string("entity_id", 34).notNullable();
    table.jsonb("before").nullable();
    table.jsonb("after").nullable();
    table.string("request_id", 60).nullable();
    table.string("ip", 45).nullable();

    addTimestamps(knex, table);

    table.index(["entity_type", "entity_id"]);
    table.index(["actor_id"]);
    table.index(["created_at"]);
  });

  // Append-only at the DB level: no UPDATE or DELETE, ever.
  await knex.raw(`
    REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("audit_log");
}

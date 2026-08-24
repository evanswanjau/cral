import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * A session is a rotating refresh-token family (spec §5): one row per
 * device login. Each refresh call replaces `token_hash` with a fresh
 * value and stashes the previous hash in `previous_token_hash` — if that
 * previous hash is ever presented again, it's a replay of an already-used
 * token, so the whole session is revoked (`revoked_at` set,
 * `revoked_reason: "reuse_detected"`).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sessions", (table) => {
    addId(table);

    table.string("user_id", 34).notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("device_id", 100).notNullable();
    table.string("device_label", 200).nullable();
    table.string("ip", 45).nullable();
    table.string("user_agent", 400).nullable();

    table.string("token_hash", 64).notNullable().unique(); // sha256 of the current refresh token
    table.string("previous_token_hash", 64).nullable();

    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("last_seen_at", { useTz: true }).notNullable();
    table.timestamp("revoked_at", { useTz: true }).nullable();
    table.string("revoked_reason", 40).nullable(); // "logout" | "reuse_detected" | "password_reset" | "password_change" | "admin_revoked"

    addTimestamps(knex, table);

    table.index(["user_id"]);
    table.index(["expires_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("sessions");
}

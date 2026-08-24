import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Email-link resets (spec §6): a 32-byte random token, stored only as its
 * SHA-256 hash, 30-minute life, single use. Phone-only accounts reuse
 * otp_codes with purpose="password_reset" instead — the server picks the
 * channel from what the account has verified and never reveals which.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("password_reset_tokens", (table) => {
    addId(table);

    table.string("user_id", 34).notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("token_hash", 64).notNullable().unique();

    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("consumed_at", { useTz: true }).nullable();

    addTimestamps(knex, table);

    table.index(["user_id"]);
    table.index(["expires_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("password_reset_tokens");
}

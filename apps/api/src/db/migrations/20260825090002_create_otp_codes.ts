import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * One-time codes for signup verification, passwordless login, and phone
 * change (spec §4/§5/§7). 6 digits, 10-minute life, 5 attempts before the
 * code dies (spec §6's rate-limit box applies the same shape everywhere).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("otp_codes", (table) => {
    addId(table);

    table.string("identifier", 320).notNullable(); // phone or email the code was sent to
    table.string("purpose", 20).notNullable(); // "signup" | "login" | "phone_change" | "password_reset"
    table.string("code_hash", 64).notNullable(); // sha256 of the 6-digit code

    table.integer("attempts").notNullable().defaultTo(0);
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("consumed_at", { useTz: true }).nullable();

    addTimestamps(knex, table);

    table.index(["identifier", "purpose"]);
    table.index(["expires_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("otp_codes");
}

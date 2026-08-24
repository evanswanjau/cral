import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * One user table, many role bindings (spec §3) — a person can be a customer
 * and a merchant with the same login. Roles kept as a simple text array
 * rather than a join table: no role in scope right now carries its own
 * metadata (merchant_staff's merchant association lives on the merchant's
 * team table, not here), so a join table would be pure ceremony.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("users", (table) => {
    addId(table);

    table.string("full_name", 200).notNullable();
    table.string("phone", 20).notNullable().unique();
    table.string("email", 320).notNullable().unique();
    table.string("password_hash", 200).notNullable();

    table.specificType("roles", "text[]").notNullable().defaultTo('{customer}');

    table.boolean("phone_verified").notNullable().defaultTo(false);
    table.boolean("email_verified").notNullable().defaultTo(false);

    table.string("terms_accepted_version", 40).nullable();
    table.timestamp("terms_accepted_at", { useTz: true }).nullable();
    table.string("terms_accepted_ip", 45).nullable();

    // Simple counter-based lockout (spec §5): 15 min after 10 failures.
    table.integer("failed_login_count").notNullable().defaultTo(0);
    table.timestamp("locked_until", { useTz: true }).nullable();

    table.string("pin_hash", 200).nullable(); // optional merchant handover PIN, spec §5

    table.boolean("erasure_requested").notNullable().defaultTo(false);
    table.timestamp("erasure_cooling_off_until", { useTz: true }).nullable();

    addTimestamps(knex, table);

    table.index(["email"]);
    table.index(["phone"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("users");
}

import type { Knex } from "knex";
import { addId, addMoneyColumn, addTimestamps } from "../schema-helpers.js";

/**
 * Drivers (owner's call, 2026-10-18 - docs/plans/drivers.md).
 *
 * A driver is a record a merchant uploads, the way a vehicle is: their own
 * person ("This is me") or someone they employ. A merchant can have many;
 * a driver belongs to exactly one merchant, enforced by a globally unique
 * normalised national ID and licence number - the same shape as the
 * registration-plate index, so "12 345 678" and "12345678" collide.
 *
 * Three documents, nothing else: driving licence, national ID, KRA PIN.
 * They are ordinary `documents` rows carrying the new `driver_id`. For the
 * account holder the ID and KRA PIN are the account's own documents
 * (already reviewed at the account gate), so only the licence is uploaded.
 *
 * `merchants.drivers_only` lets someone with no car finish onboarding: the
 * wizard's "at least one vehicle" rule is waived for them.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("drivers", (table) => {
    addId(table);
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");

    table.string("full_name", 120).notNullable();
    table.string("phone", 20).notNullable();
    table.string("national_id", 30).notNullable();
    table.string("kra_pin", 20).notNullable();
    table.string("licence_number", 30).notNullable();
    table.date("licence_expiry").notNullable();
    table.string("county", 60).notNullable();
    // True when the driver is the merchant themself - their ID and KRA PIN
    // are the account's documents, not a second upload.
    table.boolean("is_account_holder").notNullable().defaultTo(false);

    // Any of the three units; at least one is required before submit.
    addMoneyColumn(table, "daily_rate", { nullable: true });
    addMoneyColumn(table, "hourly_rate", { nullable: true });
    addMoneyColumn(table, "trip_rate", { nullable: true });

    // draft | pending | review | action | rejected | live | paused
    table.string("status", 20).notNullable().defaultTo("draft");
    table.text("reviewer_note").nullable();
    table.string("review_assignee", 34).nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    table.timestamp("submitted_at", { useTz: true }).nullable();
    table.timestamp("decided_at", { useTz: true }).nullable();

    addTimestamps(knex, table);
    table.index(["merchant_id", "created_at"]);
    table.index(["status", "submitted_at"]);
  });

  await knex.raw(`
    CREATE UNIQUE INDEX drivers_national_id_norm_unique
    ON drivers (upper(regexp_replace(national_id, '[^A-Za-z0-9]', '', 'g')))
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX drivers_licence_norm_unique
    ON drivers (upper(regexp_replace(licence_number, '[^A-Za-z0-9]', '', 'g')))
  `);

  await knex.schema.alterTable("documents", (table) => {
    table.string("driver_id", 34).nullable().references("id").inTable("drivers").onDelete("CASCADE");
    table.index(["driver_id"]);
  });

  await knex.schema.alterTable("merchants", (table) => {
    table.boolean("drivers_only").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("drivers_only");
  });
  await knex.schema.alterTable("documents", (table) => {
    table.dropColumn("driver_id");
  });
  await knex.schema.dropTableIfExists("drivers");
}

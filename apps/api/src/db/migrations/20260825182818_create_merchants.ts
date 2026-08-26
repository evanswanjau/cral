import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * One row per merchant user (spec §9) — the server-side home for the
 * onboarding wizard, which previously ran entirely against localStorage
 * (see apps/merchant/src/lib/onboarding-draft.ts). `last_activity_at` is
 * the field the stalled-onboarding reminder system keys off; every write
 * anywhere in this module bumps it, not just step changes.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("merchants", (table) => {
    addId(table);

    table
      .string("user_id", 34)
      .notNullable()
      .unique()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table.string("owner_type", 20).notNullable().defaultTo("individual"); // "individual" | "company"
    table.string("company_name", 200).nullable();
    table.string("company_cert_no", 100).nullable();
    table.string("company_kra", 50).nullable();

    table.string("first_name", 100).nullable();
    table.string("middle_name", 100).nullable();
    table.string("surname", 100).nullable();
    table.string("national_id", 20).nullable();
    table.string("kra_pin", 50).nullable();
    table.string("county", 60).nullable();

    table.boolean("payout_same").notNullable().defaultTo(true);
    table.string("payout_method", 10).notNullable().defaultTo("mpesa"); // "mpesa" | "bank"
    table.string("payout_detail", 20).nullable();
    table.string("bank_name", 100).nullable();
    table.string("bank_branch", 100).nullable();
    table.string("bank_account_name", 150).nullable();
    table.string("bank_account_number", 50).nullable();

    // A separate agreement from users.terms_accepted_version (the platform
    // ToS accepted at signup) — this is the merchant listing agreement from
    // the Review step, with its own independent version lifecycle.
    table.string("merchant_terms_accepted_version", 50).nullable();
    table.timestamp("merchant_terms_accepted_at", { useTz: true }).nullable();
    table.string("merchant_terms_accepted_ip", 45).nullable();

    table.integer("onboarding_step").notNullable().defaultTo(1);
    table.string("onboarding_screen", 20).notNullable().defaultTo("fleet"); // "fleet" | "vehicle-form"
    table.boolean("onboarding_submitted").notNullable().defaultTo(false);
    table.timestamp("last_activity_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    addTimestamps(knex, table);

    // The reminder sweep's exact scan shape: unsubmitted merchants ordered/filtered by staleness.
    table.index(["onboarding_submitted", "last_activity_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("merchants");
}

import type { Knex } from "knex";

/**
 * `merchants.trading_name` — the name a hirer sees on a listing when it
 * differs from the registered business name (e.g. "Karanja Fleet" vs
 * "Karanja Fleet Limited"). Added for the Settings → Business tab, which is
 * the first surface that lets a merchant edit their profile after
 * onboarding. Nullable: every existing merchant predates it and the field
 * is optional in the design.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.string("trading_name", 200).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("trading_name");
  });
}

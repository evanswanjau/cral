import type { Knex } from "knex";

/**
 * `vehicles.rate_mode` - how the merchant chose to set the price when
 * adding the vehicle (owner's call, 2026-09-04):
 *
 *  - `list`  - they typed the price a hirer pays (the default, unchanged).
 *  - `net`   - they typed the amount they want to receive, and the form
 *              grossed it up by the commission rate.
 *
 * `daily_rate_amount` always stores the gross (list) price either way -
 * this column only remembers which view to show the merchant next time.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("vehicles", (table) => {
    table.string("rate_mode", 8).notNullable().defaultTo("list");
  });
  await knex.raw(
    `ALTER TABLE vehicles ADD CONSTRAINT vehicles_rate_mode_check
       CHECK (rate_mode IN ('list', 'net'))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_rate_mode_check`);
  await knex.schema.alterTable("vehicles", (table) => {
    table.dropColumn("rate_mode");
  });
}

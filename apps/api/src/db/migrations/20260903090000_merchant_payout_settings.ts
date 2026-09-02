import type { Knex } from "knex";

/**
 * Settings → Payouts became an editable form (owner's call, 2026-09-03).
 * Two new columns:
 *
 *  - `payout_schedule` — the long-booking instalment rhythm the design
 *    offers ("Every Monday" / "Monthly, on the 1st"). Stored, not acted
 *    on: nothing pays in instalments yet (no rail), so this is a
 *    preference held for when one exists. Default `weekly`, matching the
 *    design's "The default" label.
 *  - `payout_mpesa_name` — "Name on the M-Pesa line" from the design. Not
 *    collected at onboarding (which only takes the number); nullable.
 *
 * The bank columns and `payout_method` already exist from the original
 * create-merchants migration — this only adds what was missing.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.string("payout_schedule", 16).notNullable().defaultTo("weekly");
    table.string("payout_mpesa_name", 200).nullable();
  });
  await knex.raw(
    `ALTER TABLE merchants ADD CONSTRAINT merchants_payout_schedule_check
       CHECK (payout_schedule IN ('weekly', 'monthly'))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_payout_schedule_check`);
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("payout_schedule");
    table.dropColumn("payout_mpesa_name");
  });
}

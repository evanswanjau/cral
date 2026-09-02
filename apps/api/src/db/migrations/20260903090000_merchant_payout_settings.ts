import type { Knex } from "knex";

/**
 * Settings → Payouts became an editable form (owner's call, 2026-09-03).
 *
 * `payout_schedule` — the long-booking instalment rhythm the design offers
 * ("Every Monday" / "Monthly, on the 1st"). Stored, not acted on: nothing
 * pays in instalments yet (no rail), so this is a preference held for when
 * one exists. Default `weekly`. Bank payouts are always `monthly` (the
 * service coerces it), M-Pesa may be either.
 *
 * The M-Pesa payout number is *not* a stored field — it is always
 * `users.phone` (owner's call: to change it you change your phone number
 * on the profile). The bank columns and `payout_method` already exist from
 * the original create-merchants migration.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.string("payout_schedule", 16).notNullable().defaultTo("weekly");
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
  });
}

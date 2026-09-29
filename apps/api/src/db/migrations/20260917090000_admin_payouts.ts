import type { Knex } from "knex";

/**
 * Admin Payouts (docs/plans/admin-bookings-payouts.md). `payout_runs` /
 * `payout_run_lines` already exist (20260901090000) - `cutPayoutRun` is
 * the single decider of what one merchant's run contains; this migration
 * only adds the one column an admin "hold" needs.
 *
 * `payout_held` keeps a completed, deposit-released booking out of the
 * *next* cut - `payableBookings` excludes it. There is no "un-cut" once a
 * run already exists (a booking pays out exactly once, by the existing
 * unique index on payout_run_lines.booking_id), so holding only works
 * before that booking's run is cut.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("bookings", (table) => {
    table.boolean("payout_held").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("bookings", (table) => {
    table.dropColumn("payout_held");
  });
}

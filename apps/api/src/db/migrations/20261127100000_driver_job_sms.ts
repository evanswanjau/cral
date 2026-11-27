import type { Knex } from "knex";

/**
 * The driver is told about a paid job, and a driver-only job's pickup
 * code runs driver to renter (owner's call, 2026-11-27 - PR DR4 of
 * `docs/plans/drivers-that-work.md`).
 *
 * - `bookings.driver_sms_sent_at`: when the job SMS reached the driver's
 *   phone. Set once; a redelivered queue job reads it and sends nothing,
 *   the same guard `notifications.sms_sent_at` gives the merchant's texts.
 * - `handovers.code_holder`: who was given the pickup code. `hirer` (every
 *   handover until now: the code is emailed to the renter, who reads it to
 *   the merchant) or `driver` (texted to the driver, who reads it to the
 *   renter, who enters it in the customer app). Only a `driver` row can be
 *   answered from the customer side.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("bookings", (table) => {
    table.timestamp("driver_sms_sent_at", { useTz: true }).nullable();
  });
  await knex.schema.alterTable("handovers", (table) => {
    table.string("code_holder", 10).notNullable().defaultTo("hirer");
  });
  await knex.raw(
    `ALTER TABLE handovers ADD CONSTRAINT handovers_code_holder_check
       CHECK (code_holder IN ('hirer', 'driver'))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE handovers DROP CONSTRAINT IF EXISTS handovers_code_holder_check");
  await knex.schema.alterTable("handovers", (table) => {
    table.dropColumn("code_holder");
  });
  await knex.schema.alterTable("bookings", (table) => {
    table.dropColumn("driver_sms_sent_at");
  });
}

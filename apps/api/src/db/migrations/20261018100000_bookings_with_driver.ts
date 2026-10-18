import type { Knex } from "knex";
import { addMoneyColumn } from "../schema-helpers.js";

/**
 * Bookings with a driver (owner's call, 2026-10-18 - docs/plans/drivers.md).
 *
 * Two new shapes on the existing `bookings` table rather than a second
 * table - one pricing path, one handover, one payout path:
 *
 * - car + driver: `vehicle_id` and `driver_id` both set. The driver is one
 *   of the car's own merchant's drivers, so the booking still has exactly
 *   one payee and `payout_run_lines.booking_id` stays globally unique.
 * - driver only: the renter's own car. `vehicle_id` null, `driver_id` set,
 *   `hire_car_details` says what car the driver is coming to drive.
 *
 * `gross`/`commission`/`merchant_net` stay the whole booking's figures.
 * `driver_amount` is the driver's share of `gross`, and
 * `driver_rate_unit`/`_quantity` its basis - display snapshots, the same
 * footing as `rate_unit`/`rate_quantity`.
 *
 * `payout_run_lines.vehicle_registration` becomes nullable: a driver-only
 * line has no plate to denormalise.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("bookings", (table) => {
    table.string("vehicle_id", 34).nullable().alter();
    table.string("driver_id", 34).nullable().references("id").inTable("drivers").onDelete("RESTRICT");
    addMoneyColumn(table, "driver", { nullable: true });
    table.string("driver_rate_unit", 10).nullable();
    table.integer("driver_rate_quantity").nullable();
    table.string("hire_car_details", 200).nullable();
    table.index(["driver_id", "pickup_at"]);
  });
  await knex.raw(`
    ALTER TABLE bookings
    ADD CONSTRAINT bookings_vehicle_or_driver_chk
    CHECK (vehicle_id IS NOT NULL OR driver_id IS NOT NULL)
  `);
  await knex.schema.alterTable("payout_run_lines", (table) => {
    table.string("vehicle_registration", 20).nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_vehicle_or_driver_chk");
  await knex.schema.alterTable("bookings", (table) => {
    table.dropIndex(["driver_id", "pickup_at"]);
    table.dropColumn("hire_car_details");
    table.dropColumn("driver_rate_quantity");
    table.dropColumn("driver_rate_unit");
    table.dropColumn("driver_currency");
    table.dropColumn("driver_amount");
    table.dropColumn("driver_id");
  });
}

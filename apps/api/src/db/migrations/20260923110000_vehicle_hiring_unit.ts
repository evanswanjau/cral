import type { Knex } from "knex";
import { addMoneyColumn } from "../schema-helpers.js";

/**
 * Hiring cadence (owner's call, 2026-09-23) - the second half of the same
 * feedback that produced "Services". Three units: `day` (unchanged
 * default, small cars), `hour` (mainly heavy machinery/equipment), `trip`
 * (mainly trucks/transport). `daily_rate_amount` keeps its exact existing
 * meaning; the two new rate columns are additive so no existing listing or
 * booking changes shape.
 *
 * `bookings` gets a matching snapshot pair - `rate_unit` + `rate_quantity`
 * - so a receipt/detail screen can say "3 hours" instead of always "days".
 * This is display-only: `gross`/`commission`/`merchant_net` were already
 * computed once at booking time and never recomputed, so no further
 * snapshot is needed to keep a later rate change from rewriting a past
 * booking - that guarantee already existed.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("vehicles", (table) => {
    // day | hour | trip
    table.string("hiring_unit", 10).notNullable().defaultTo("day");
    addMoneyColumn(table, "hourly_rate", { nullable: true });
    addMoneyColumn(table, "trip_rate", { nullable: true });
  });

  await knex.schema.alterTable("bookings", (table) => {
    // day | hour | trip - what `rate_quantity` counts.
    table.string("rate_unit", 10).notNullable().defaultTo("day");
    // Days for a day-unit booking (as before), hours (rounded up) for an
    // hour-unit one, always 1 for a trip-unit one.
    table.integer("rate_quantity").notNullable().defaultTo(1);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("bookings", (table) => {
    table.dropColumn("rate_unit");
    table.dropColumn("rate_quantity");
  });
  await knex.schema.alterTable("vehicles", (table) => {
    table.dropColumn("hiring_unit");
    table.dropColumn("hourly_rate_amount");
    table.dropColumn("hourly_rate_currency");
    table.dropColumn("trip_rate_amount");
    table.dropColumn("trip_rate_currency");
  });
}

import type { Knex } from "knex";
import { addTimestamps } from "../schema-helpers.js";

/**
 * Backs the new booking-ref format `CB` + `YYMMDD` + a 3-digit sequence
 * that restarts every day (owner's call, 2026-09-22 - matching the
 * listing-ref format's own `H` + `YYMMDD` + daily counter, so the two
 * plated references read the same way): `CB260922001` is the first
 * booking made on 2026-09-22, `CB260922002` the second, and the next day
 * starts again at `001`. Replaces the old `booking_ref_seq` sequence,
 * which produced an undated, ever-increasing number (`CB-2900`,
 * `CB-2901`, ...) - left in place, just unused, same footing as the
 * listing ref's own retired sequence.
 *
 * One row per Nairobi calendar day, incremented via `INSERT ... ON
 * CONFLICT` inside the same transaction as the booking insert (see
 * `lib/booking-ref.ts#nextBookingRef`). An id-generation primitive rather
 * than a domain entity, so it keeps a natural `day` PK rather than the
 * prefixed-ULID convention - same reasoning as `listing_ref_daily_counters`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("booking_ref_daily_counters", (table) => {
    table.date("day").primary();
    table.integer("n").notNullable().defaultTo(0);
    addTimestamps(knex, table);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("booking_ref_daily_counters");
}

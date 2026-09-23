import type { Knex } from "knex";

/**
 * `20260923110000` added `bookings.rate_quantity` with a default of 1, so
 * every day booking made before it read "1" however long the hire was -
 * contradicting the contract ("equal to `days` for a day booking"). This
 * recomputes it with the same inclusive Nairobi-day count as
 * `lib/dates.ts#inclusiveHireDays`, so rows created since are unchanged.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE bookings
    SET rate_quantity = GREATEST(
      1,
      (dropoff_at AT TIME ZONE 'Africa/Nairobi')::date
        - (pickup_at AT TIME ZONE 'Africa/Nairobi')::date + 1
    )
    WHERE rate_unit = 'day'
  `);
}

export async function down(): Promise<void> {
  // Nothing to undo - the previous values were the column default, not data.
}

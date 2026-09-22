import type { Knex } from "knex";
import { db } from "../db/client.js";

/**
 * The plated booking reference both sides read aloud. `CB` + `YYMMDD` + a
 * 3-digit sequence that restarts every Nairobi calendar day (owner's call,
 * 2026-09-22), e.g. `CB260922001` for the first booking made on
 * 2026-09-22 - the same shape as `vehicles.listing_ref`
 * (`lib/vehicle-events.ts#nextListingRef`), so the two plated references
 * both read as "which day, which one that day" rather than one dated and
 * one an opaque running count. A human reference, not a primary key, so
 * it is this daily counter rather than the prefixed-ULID convention -
 * same reasoning as the listing ref.
 *
 * Distinct from the handover code: this one is public to both parties and
 * proves nothing. The handover code is a separate one-time secret the
 * hirer reads to the merchant to prove presence.
 *
 * Backed by `booking_ref_daily_counters`, bumped atomically here so
 * concurrent inserts can't collide - runs inside the caller's
 * transaction, so a rolled-back booking insert rolls the counter back
 * too. Replaces `booking_ref_seq`, left in place unused.
 *
 * (`modules/bookings/dev-seed.ts` and `modules/payouts/dev-seed.ts` each
 * carry their own copy of the old query, predating this helper. They are
 * dev-only; fold them in next time either is touched.)
 */
export async function nextBookingRef(trx: Knex.Transaction | Knex = db): Promise<string> {
  const result = await trx.raw<{ rows: { day: string; n: number }[] }>(
    `INSERT INTO booking_ref_daily_counters (day, n, created_at, updated_at)
     VALUES ((now() AT TIME ZONE 'Africa/Nairobi')::date, 1, now(), now())
     ON CONFLICT (day)
     DO UPDATE SET n = booking_ref_daily_counters.n + 1, updated_at = now()
     RETURNING to_char(day, 'YYMMDD') AS day, n`,
  );
  const { day, n } = result.rows[0]!;
  return `CB${day}${String(n).padStart(3, "0")}`;
}

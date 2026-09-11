import type { Knex } from "knex";
import { db } from "../db/client.js";

/**
 * The plated booking reference both sides read aloud ("CB-2841"). A human
 * reference, not a primary key, so it is a plain sequence rather than the
 * prefixed-ULID convention - same reasoning as `vehicles.listing_ref`.
 *
 * Distinct from the handover code: this one is public to both parties and
 * proves nothing. The handover code is a separate one-time secret the
 * hirer reads to the merchant to prove presence.
 *
 * (`modules/bookings/dev-seed.ts` and `modules/payouts/dev-seed.ts` each
 * carry their own copy of this query, predating this helper. They are
 * dev-only; fold them in next time either is touched.)
 */
export async function nextBookingRef(trx: Knex.Transaction | Knex = db): Promise<string> {
  const result = await trx.raw<{ rows: { n: string }[] }>(
    "select nextval('booking_ref_seq') as n",
  );
  return `CB-${result.rows[0]!.n}`;
}

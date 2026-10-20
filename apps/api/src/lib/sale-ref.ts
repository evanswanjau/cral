import type { Knex } from "knex";

/**
 * A car-sale listing's plated reference: `S` + Nairobi `YYMMDD` + a
 * 3-digit sequence that restarts each day - the same shape as
 * `nextListingRef` (hire listings, `H…`) and `nextBookingRef` (`CB…`), so
 * all three read as "which day, which one that day". One atomic upsert on
 * `sale_ref_daily_counters`, so two approvals at once can't share a number.
 */
export async function nextSaleRef(trx: Knex.Transaction | Knex): Promise<string> {
  const result = await trx.raw<{ rows: { day: string; n: number }[] }>(
    `INSERT INTO sale_ref_daily_counters (day, n, created_at, updated_at)
     VALUES ((now() AT TIME ZONE 'Africa/Nairobi')::date, 1, now(), now())
     ON CONFLICT (day)
     DO UPDATE SET n = sale_ref_daily_counters.n + 1, updated_at = now()
     RETURNING to_char(day, 'YYMMDD') AS day, n`,
  );
  const { day, n } = result.rows[0]!;
  return `S${day}${String(n).padStart(3, "0")}`;
}

import type { Knex } from "knex";
import { addTimestamps } from "../schema-helpers.js";

/**
 * Backs the new listing-ref format `H` + `YYMMDD` + a 3-digit sequence
 * that restarts every day (owner's call, 2026-08-31): `H260831001` is the
 * first vehicle listed on 2026-08-31, `H260831002` the second, and the
 * next day starts again at `001`.
 *
 * One row per Nairobi calendar day, incremented via `INSERT ... ON
 * CONFLICT` inside the same transaction as the vehicle insert (see
 * `lib/vehicle-events.ts#nextListingRef`). Like the pre-existing
 * `vehicle_listing_ref_seq`, this is an id-generation primitive rather
 * than a domain entity, so it keeps a natural `day` PK rather than the
 * prefixed-ULID convention.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("listing_ref_daily_counters", (table) => {
    table.date("day").primary();
    table.integer("n").notNullable().defaultTo(0);
    addTimestamps(knex, table);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("listing_ref_daily_counters");
}

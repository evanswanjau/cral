import type { Knex } from "knex";

/**
 * County moves off the owner's personal details and onto each vehicle's
 * location (owner's call, 2026-08-31) — the location a hirer cares about
 * is the vehicle's ("County, then pickup address"), not the merchant's
 * home county. `merchants.county` is dropped; nothing else read it.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("vehicles", (table) => {
    table.string("county", 60).nullable();
  });
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("county");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.string("county", 60).nullable();
  });
  await knex.schema.alterTable("vehicles", (table) => {
    table.dropColumn("county");
  });
}

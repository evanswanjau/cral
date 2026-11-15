import type { Knex } from "knex";

/**
 * Route and load on a truck request (owner's call, 2026-11-10 - PR T2 of
 * `docs/plans/trucks-and-sales-agents.md`). A truck is hired to move
 * something from one place to another, so the request says where from,
 * where to and what. Set only on bookings for a `truck` listing; null on
 * every other booking, so nothing that reads bookings today changes.
 *
 * `pickup_location` / `dropoff_location` are still filled for a truck -
 * from the route - so every existing reader keeps working.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("bookings", (table) => {
    table.string("route_from", 300).nullable();
    table.string("route_from_county", 60).nullable();
    table.string("route_to", 300).nullable();
    table.string("route_to_county", 60).nullable();
    table.string("cargo_description", 300).nullable();
    // Kilograms, an integer like money is cents - entered and shown in tonnes.
    table.integer("cargo_kg").nullable();
  });
  // A route is all four parts or none, so a half-filled route can't reach
  // the merchant's screen from a script or a seed.
  await knex.raw(
    `ALTER TABLE bookings ADD CONSTRAINT bookings_route_complete_check
       CHECK (
         (route_from IS NULL AND route_from_county IS NULL AND route_to IS NULL AND route_to_county IS NULL)
         OR (route_from IS NOT NULL AND route_from_county IS NOT NULL AND route_to IS NOT NULL AND route_to_county IS NOT NULL)
       )`,
  );
  await knex.raw(
    `ALTER TABLE bookings ADD CONSTRAINT bookings_cargo_kg_check
       CHECK (cargo_kg IS NULL OR (cargo_kg > 0 AND cargo_kg <= 100000))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cargo_kg_check");
  await knex.raw("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_route_complete_check");
  await knex.schema.alterTable("bookings", (table) => {
    table.dropColumn("route_from");
    table.dropColumn("route_from_county");
    table.dropColumn("route_to");
    table.dropColumn("route_to_county");
    table.dropColumn("cargo_description");
    table.dropColumn("cargo_kg");
  });
}

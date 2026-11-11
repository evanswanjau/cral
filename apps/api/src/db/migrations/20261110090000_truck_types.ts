import type { Knex } from "knex";

/**
 * Truck types and capacity (owner's call, 2026-11-10 - PR T1 of
 * `docs/plans/trucks-and-sales-agents.md`). Only meaningful when
 * `vehicles.type = 'truck'`; null for every other category. Both are
 * nullable and enforced per-vehicle at submission (like `county` and
 * `insurance_expiry`), so a draft can be saved half-filled.
 *
 * `truck_type` slugs live in `modules/vehicles/categories.ts#TRUCK_TYPES`.
 * The CHECK repeats that list so a bad slug can't reach the catalog filter
 * from a script or a seed - keep the two in step.
 */
const TRUCK_TYPES = [
  "pickup",
  "canter",
  "box_body",
  "flatbed",
  "tipper",
  "refrigerated",
  "water_bowser",
  "prime_mover",
  "low_loader",
  "crane_truck",
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("vehicles", (table) => {
    table.string("truck_type", 20).nullable();
    // Kilograms, an integer like money is cents - shown to renters as tonnes.
    table.integer("payload_kg").nullable();
  });
  await knex.raw(
    `ALTER TABLE vehicles ADD CONSTRAINT vehicles_truck_type_check
       CHECK (truck_type IS NULL OR truck_type IN (${TRUCK_TYPES.map((t) => `'${t}'`).join(", ")}))`,
  );
  await knex.raw(
    `ALTER TABLE vehicles ADD CONSTRAINT vehicles_payload_kg_check
       CHECK (payload_kg IS NULL OR (payload_kg > 0 AND payload_kg <= 100000))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_payload_kg_check");
  await knex.raw("ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_truck_type_check");
  await knex.schema.alterTable("vehicles", (table) => {
    table.dropColumn("truck_type");
    table.dropColumn("payload_kg");
  });
}

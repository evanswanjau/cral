import type { Knex } from "knex";
import { LEGACY_TYPE_REMAP } from "../../modules/vehicles/categories.js";

/**
 * Replaces the old free-text `vehicles.type` values (Car / SUV / Van /
 * Pickup / Lorry) with the new category slugs (owner's call, 2026-08-31).
 * See `modules/vehicles/categories.ts` for the mapping. Bookings keep no
 * type column of their own — the Bookings screen reads it off the joined
 * vehicle — so there is nothing else to migrate.
 */
export async function up(knex: Knex): Promise<void> {
  for (const [oldValue, newValue] of Object.entries(LEGACY_TYPE_REMAP)) {
    await knex("vehicles").where({ type: oldValue }).update({ type: newValue });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Best-effort reverse — `suv` folds Pickup and SUV together, so it can
  // only come back as one of them.
  const reverse: Record<string, string> = {
    sedan: "Car",
    suv: "SUV",
    van: "Van",
    truck: "Lorry",
    machinery: "Lorry",
  };
  for (const [newValue, oldValue] of Object.entries(reverse)) {
    await knex("vehicles").where({ type: newValue }).update({ type: oldValue });
  }
}

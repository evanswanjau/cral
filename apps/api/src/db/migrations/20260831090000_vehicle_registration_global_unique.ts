import type { Knex } from "knex";

/**
 * A registration plate is unique in the real world, so it must be unique
 * across the whole platform — not just once per merchant (owner's call,
 * 2026-08-31). Replaces the `(merchant_id, registration)` composite unique
 * with a global functional unique index on the normalised plate
 * (upper-cased, non-alphanumerics stripped) so "KDL 442N", "kdl442n" and
 * "KDL-442N" all collide.
 *
 * If this fails to build, a dev database already holds two rows whose
 * plates normalise equal — dedupe those first. `duplicateVehicle`'s
 * placeholder plates ("NEW A1B2C3") stay unique via their random suffix.
 */
const INDEX_NAME = "vehicles_registration_norm_unique";
const NORM = "upper(regexp_replace(registration, '[^A-Za-z0-9]', '', 'g'))";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("vehicles", (table) => {
    table.dropUnique(["merchant_id", "registration"]);
  });
  await knex.raw(`CREATE UNIQUE INDEX ${INDEX_NAME} ON vehicles (${NORM})`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
  await knex.schema.alterTable("vehicles", (table) => {
    table.unique(["merchant_id", "registration"]);
  });
}

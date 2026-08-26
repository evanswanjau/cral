import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * One table for both owner-level and vehicle-level documents/photos (spec
 * §9) — they share every column, differing only by `kind` and whether
 * `vehicle_id` is set. Single-slot kinds (everything but `vehicle_photo`)
 * get "replace" semantics enforced in the service layer (delete-then-insert
 * in a transaction), not a DB constraint, since `vehicle_photo` allows up
 * to 3 rows per vehicle.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("documents", (table) => {
    addId(table);

    table
      .string("merchant_id", 34)
      .notNullable()
      .references("id")
      .inTable("merchants")
      .onDelete("CASCADE");
    table
      .string("vehicle_id", 34)
      .nullable()
      .references("id")
      .inTable("vehicles")
      .onDelete("CASCADE");

    // national_id | kra_pin | logbook | comprehensive_insurance | tracker_certificate | vehicle_photo
    table.string("kind", 30).notNullable();

    table.string("storage_key", 500).notNullable();
    table.string("original_name", 255).notNullable();
    table.integer("size_bytes").notNullable();
    table.string("content_type", 100).notNullable();

    addTimestamps(knex, table);

    table.index(["merchant_id"]);
    table.index(["vehicle_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("documents");
}

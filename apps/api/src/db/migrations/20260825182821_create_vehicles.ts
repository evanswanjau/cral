import type { Knex } from "knex";
import { addId, addMoneyColumn, addTimestamps } from "../schema-helpers.js";

/** A vehicle added to a merchant's draft (spec §9), mirroring DraftVehicle. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("vehicles", (table) => {
    addId(table);

    table
      .string("merchant_id", 34)
      .notNullable()
      .references("id")
      .inTable("merchants")
      .onDelete("CASCADE");

    table.string("type", 20).notNullable(); // Car | SUV | Van | Pickup | Lorry
    table.string("make", 80).notNullable();
    table.string("model", 80).notNullable();
    table.string("year", 4).notNullable();
    table.string("registration", 20).notNullable();
    table.string("transmission", 20).notNullable(); // Automatic | Manual
    table.string("fuel", 20).notNullable(); // Petrol | Diesel | Hybrid | Electric
    table.string("colour", 40).nullable();
    table.string("pickup_address", 300).nullable();

    addMoneyColumn(table, "daily_rate");

    table.date("insurance_expiry").nullable();

    addTimestamps(knex, table);

    table.index(["merchant_id"]);
    // One plate per draft — not a global uniqueness check yet, that's a
    // later phase's cross-merchant duplicate-listing problem.
    table.unique(["merchant_id", "registration"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("vehicles");
}

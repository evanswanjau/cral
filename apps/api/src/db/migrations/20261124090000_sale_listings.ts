import type { Knex } from "knex";
import { addId, addMoneyColumn, addTimestamps } from "../schema-helpers.js";

/**
 * Phase 6 CS1 - cars for sale, merchant side (docs/decisions/car-sales.md,
 * openapi/merchant-sales.yaml). Classifieds: no escrow, no commission.
 *
 * - `sale_listings`: one car a merchant lists. `ref` is `S-YYMMDD-NNN`
 *   from `sale_ref_daily_counters`. The asking price is bigint cents
 *   (`addMoneyColumn(..., { big: true })`): plenty of cars cost more than
 *   integer cents can hold. `review_assignee`/`reviewer_note`/`decided_at`
 *   are written by the Ops review (CS2).
 * - One open listing per plate: a partial unique index on the normalised
 *   registration while the listing is not final.
 * - `sale_listing_files`: photos and the logbook, own rows kept out of
 *   `documents` (same reason as `outlet_photos`).
 * - `merchants.sells_only`: signed up to sell cars and nothing else, so
 *   onboarding submits with no vehicle (like `garage_only`).
 * - `platform_settings.sales.listing_fee`: the owner's 2026-11-19 call,
 *   free at launch. Cents, 0 = off. Nothing charges it yet (CS4).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sale_listings", (table) => {
    addId(table);
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");
    table.string("ref", 20).notNullable().unique();

    table.string("body_type", 20).notNullable();
    table.string("make", 60).notNullable();
    table.string("model", 60).notNullable();
    table.integer("year").notNullable();
    table.string("registration", 20).notNullable();
    table.integer("mileage_km").notNullable();
    table.string("transmission", 20).notNullable();
    table.string("fuel", 20).notNullable();
    table.integer("engine_cc").nullable();
    table.string("colour", 40).nullable();
    table.string("import_status", 20).notNullable();
    table.string("accident_history", 10).notNullable();
    table.text("known_faults").notNullable();
    table.boolean("encumbered").notNullable();

    addMoneyColumn(table, "asking_price", { big: true });
    table.boolean("negotiable").notNullable().defaultTo(true);
    table.string("county", 60).notNullable();
    table.string("viewing_area", 120).notNullable();
    table.text("description").nullable();

    // draft | pending | review | action | rejected | live | paused | sold | withdrawn
    table.string("status", 20).notNullable().defaultTo("draft");
    table.text("reviewer_note").nullable();
    table.string("review_assignee", 34).nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    table.timestamp("submitted_at", { useTz: true }).nullable();
    table.timestamp("decided_at", { useTz: true }).nullable();
    table.timestamp("live_at", { useTz: true }).nullable();
    table.timestamp("sold_at", { useTz: true }).nullable();

    addTimestamps(knex, table);
    table.index(["merchant_id", "created_at"]);
    table.index(["status", "submitted_at"]);
  });

  await knex.raw(`
    CREATE UNIQUE INDEX sale_listings_registration_open_unique
    ON sale_listings (upper(regexp_replace(registration, '[^A-Za-z0-9]', '', 'g')))
    WHERE status NOT IN ('sold', 'withdrawn')
  `);

  await knex.schema.createTable("sale_listing_files", (table) => {
    addId(table);
    table.string("sale_listing_id", 34).notNullable().references("id").inTable("sale_listings").onDelete("CASCADE");
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");
    table.string("kind", 10).notNullable(); // photo | logbook
    table.string("storage_key", 500).notNullable();
    table.string("original_name", 255).notNullable();
    table.string("content_type", 100).notNullable();
    table.integer("size_bytes").notNullable();
    addTimestamps(knex, table);
    table.index(["sale_listing_id", "created_at"]);
  });

  await knex.schema.createTable("sale_ref_daily_counters", (table) => {
    table.date("day").primary();
    table.integer("n").notNullable().defaultTo(0);
    addTimestamps(knex, table);
  });

  await knex.schema.alterTable("merchants", (table) => {
    table.boolean("sells_only").notNullable().defaultTo(false);
  });

  await knex("platform_settings").insert({ key: "sales.listing_fee", value: JSON.stringify(0) });
}

export async function down(knex: Knex): Promise<void> {
  await knex("platform_settings").where({ key: "sales.listing_fee" }).delete();
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("sells_only");
  });
  await knex.schema.dropTableIfExists("sale_ref_daily_counters");
  await knex.schema.dropTableIfExists("sale_listing_files");
  await knex.schema.dropTableIfExists("sale_listings");
}

import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Extends `vehicles` and `documents` with the listing-review state the
 * merchant portal's Vehicles screen needs (design bundle's
 * "Cruz Merchant Portal.dc.html") — none of this existed while a vehicle
 * was just a row in the onboarding draft. Also adds `vehicle_events`, the
 * review-history timeline shown in the detail screen's sidebar.
 */
export async function up(knex: Knex): Promise<void> {
  // Backs `listing_ref` ("CRAL-V-4417") — a human reference, not a PK, so
  // it's a plain sequence rather than the prefixed-ULID convention.
  await knex.raw("CREATE SEQUENCE IF NOT EXISTS vehicle_listing_ref_seq START 4100");

  await knex.schema.alterTable("vehicles", (table) => {
    // draft | pending | review | action | rejected | live | paused
    table.string("status", 20).notNullable().defaultTo("draft");
    table.string("listing_ref", 20).unique();
    table.integer("seats").notNullable().defaultTo(5);
    table.integer("minimum_hire_days").notNullable().defaultTo(1);
    table.boolean("chauffeured").notNullable().defaultTo(true);
    table.timestamp("submitted_at", { useTz: true }).nullable();
    // none | pending | active
    table.string("verification_badge", 10).notNullable().defaultTo("none");
    table.timestamp("verification_badge_expires_at", { useTz: true }).nullable();
    table.text("reviewer_note").nullable();
    table.string("reviewer_note_meta", 120).nullable();
    table.boolean("reviewer_note_resolved").notNullable().defaultTo(false);
    table.index(["merchant_id", "status"]);
  });

  await knex.schema.alterTable("documents", (table) => {
    // ok | pending | expiring | rejected — a missing row is the "missing" state.
    table.string("review_state", 12).notNullable().defaultTo("pending");
    table.date("expires_at").nullable();
  });

  await knex.schema.createTable("vehicle_events", (table) => {
    addId(table);
    table
      .string("vehicle_id", 34)
      .notNullable()
      .references("id")
      .inTable("vehicles")
      .onDelete("CASCADE");
    table
      .string("merchant_id", 34)
      .notNullable()
      .references("id")
      .inTable("merchants")
      .onDelete("CASCADE");
    table.string("kind", 40).notNullable();
    table.string("tone", 10).notNullable(); // grey | blue | green | amber | red
    table.string("label", 160).notNullable();
    table.text("body").nullable();
    table.string("actor_type", 10).notNullable(); // merchant | reviewer | system
    table.string("actor_name", 120).nullable();
    table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    addTimestamps(knex, table);
    table.index(["vehicle_id", "occurred_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("vehicle_events");
  await knex.schema.alterTable("documents", (table) => {
    table.dropColumn("review_state");
    table.dropColumn("expires_at");
  });
  await knex.schema.alterTable("vehicles", (table) => {
    table.dropColumn("status");
    table.dropColumn("listing_ref");
    table.dropColumn("seats");
    table.dropColumn("minimum_hire_days");
    table.dropColumn("chauffeured");
    table.dropColumn("submitted_at");
    table.dropColumn("verification_badge");
    table.dropColumn("verification_badge_expires_at");
    table.dropColumn("reviewer_note");
    table.dropColumn("reviewer_note_meta");
    table.dropColumn("reviewer_note_resolved");
  });
  await knex.raw("DROP SEQUENCE IF EXISTS vehicle_listing_ref_seq");
}

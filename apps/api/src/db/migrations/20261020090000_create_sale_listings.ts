import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Car sales (owner's call, 2026-10-19 - docs/plans/car-sales.md).
 *
 * Reviewed classifieds: a seller lists a car, CRAL reads the logbook and
 * the eight photos against it before the advert goes live, buyers enquire,
 * and the deal and the money happen off-platform. No fee, no commission.
 *
 * - `sale_listings` is owned by a `users` row. `merchant_id` is set when
 *   the seller is a merchant (the listing belongs to the business);
 *   private sellers have it null. `vehicle_id` links a fleet car.
 * - One open sale per car: partial unique indexes on the normalised plate
 *   and chassis while the listing is still open. A clash with another
 *   account's fleet car (`vehicles`) is checked in the service under an
 *   advisory lock, since an index can't span two tables.
 * - Sale documents hang off `documents.sale_listing_id` and carry **no**
 *   merchant/user owner: the one-owner CHECK is widened to "exactly one of
 *   merchant_id / user_id / sale_listing_id". That keeps every existing
 *   query that reads a merchant's or renter's documents by owner from ever
 *   seeing a sale logbook or photo - the trap drivers hit with `driver_id`.
 * - `documents.slot` names which of the eight required photos a
 *   `sale_photo` row is.
 * - `sale_review_checks` holds the reviewer's checklist answers;
 *   `sale_enquiries` and `sale_listing_reports` are the buyer side.
 * - `vehicles.sold_at` marks a fleet car sold through a listing: it is
 *   off hire for good, and its bookings/payouts history stays.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sale_listings", (table) => {
    addId(table);
    table.string("seller_user_id", 34).notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("merchant_id", 34).nullable().references("id").inTable("merchants").onDelete("CASCADE");
    table.string("vehicle_id", 34).nullable().references("id").inTable("vehicles").onDelete("SET NULL");
    table.string("ref", 20).nullable().unique();

    table.string("category", 20).notNullable();
    table.string("make", 60).notNullable();
    table.string("model", 60).notNullable();
    table.integer("year").notNullable();
    table.string("registration", 20).notNullable();
    table.string("chassis_number", 40).notNullable();
    table.integer("mileage_km").notNullable();
    table.integer("engine_cc").nullable();
    table.string("transmission", 20).notNullable();
    table.string("fuel", 20).notNullable();
    table.string("colour", 40).nullable();
    table.string("drive", 10).nullable(); // 2wd | 4wd | awd
    table.string("import_status", 20).notNullable(); // locally_used | foreign_used | new

    // bigint, not addMoneyColumn's integer: integer cents top out at
    // KES 21.4M, below plenty of cars. Read back with Number() - safe to
    // 9e15 cents.
    table.bigInteger("asking_price_amount").notNullable();
    table.specificType("asking_price_currency", "char(3)").notNullable().defaultTo("KES");
    table.boolean("negotiable").notNullable().defaultTo(true);

    table.text("known_faults").notNullable();
    table.string("accident_history", 10).notNullable(); // none | minor | major
    table.text("accident_note").nullable();
    table.boolean("encumbered").notNullable().defaultTo(false);
    table.string("service_history", 10).notNullable(); // full | partial | none

    table.string("county", 60).notNullable();
    table.string("viewing_area", 120).notNullable();
    table.text("description").nullable();
    table.boolean("auto_share_contact").notNullable().defaultTo(false);

    // draft | pending | review | action | rejected | live | paused |
    // under_offer | sold | withdrawn | expired | removed
    table.string("status", 20).notNullable().defaultTo("draft");
    table.text("reviewer_note").nullable();
    table.string("review_assignee", 34).nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    table.timestamp("submitted_at", { useTz: true }).nullable();
    table.timestamp("decided_at", { useTz: true }).nullable();
    table.timestamp("live_at", { useTz: true }).nullable();
    table.timestamp("expires_at", { useTz: true }).nullable();
    table.timestamp("expiry_reminded_at", { useTz: true }).nullable();
    table.timestamp("sold_at", { useTz: true }).nullable();
    table.boolean("sold_via_cral").nullable();
    // Set when `under_offer` paused this listing's fleet car, so going back
    // to `live` resumes hire only if the sale is what paused it.
    table.boolean("paused_hire").notNullable().defaultTo(false);
    table.integer("view_count").notNullable().defaultTo(0);

    addTimestamps(knex, table);
    table.index(["seller_user_id", "created_at"]);
    table.index(["merchant_id"]);
    table.index(["vehicle_id"]);
    table.index(["status", "submitted_at"]);
    table.index(["status", "live_at"]);
  });

  const OPEN = `status NOT IN ('sold', 'withdrawn', 'expired', 'rejected', 'removed')`;
  await knex.raw(`
    CREATE UNIQUE INDEX sale_listings_registration_open_unique
    ON sale_listings (upper(regexp_replace(registration, '[^A-Za-z0-9]', '', 'g')))
    WHERE ${OPEN}
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX sale_listings_chassis_open_unique
    ON sale_listings (upper(regexp_replace(chassis_number, '[^A-Za-z0-9]', '', 'g')))
    WHERE ${OPEN}
  `);

  await knex.schema.createTable("sale_ref_daily_counters", (table) => {
    table.date("day").primary();
    table.integer("n").notNullable().defaultTo(0);
    addTimestamps(knex, table);
  });

  await knex.schema.alterTable("documents", (table) => {
    table.string("sale_listing_id", 34).nullable().references("id").inTable("sale_listings").onDelete("CASCADE");
    table.string("slot", 20).nullable();
    table.index(["sale_listing_id"]);
  });
  await knex.raw(`ALTER TABLE documents DROP CONSTRAINT documents_one_owner_chk`);
  await knex.raw(`
    ALTER TABLE documents
    ADD CONSTRAINT documents_one_owner_chk
    CHECK (num_nonnulls(merchant_id, user_id, sale_listing_id) = 1)
  `);

  await knex.schema.createTable("sale_review_checks", (table) => {
    table.string("sale_listing_id", 34).notNullable().references("id").inTable("sale_listings").onDelete("CASCADE");
    table.string("item_id", 40).notNullable();
    table.string("result", 10).notNullable(); // pass | flag
    table.text("note").nullable();
    table.string("answered_by", 34).nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    addTimestamps(knex, table);
    table.primary(["sale_listing_id", "item_id"]);
  });

  await knex.schema.createTable("sale_enquiries", (table) => {
    addId(table);
    table.string("sale_listing_id", 34).notNullable().references("id").inTable("sale_listings").onDelete("CASCADE");
    table.string("buyer_user_id", 34).notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.text("message").notNullable();
    table.string("viewing_window", 120).nullable();
    table.string("status", 10).notNullable().defaultTo("new"); // new | replied | closed
    table.text("reply").nullable();
    table.string("shared_phone", 20).nullable();
    table.timestamp("contact_shared_at", { useTz: true }).nullable();
    table.timestamp("replied_at", { useTz: true }).nullable();
    addTimestamps(knex, table);
    table.index(["sale_listing_id", "created_at"]);
    table.index(["buyer_user_id", "created_at"]);
  });

  await knex.schema.createTable("sale_listing_reports", (table) => {
    addId(table);
    table.string("sale_listing_id", 34).notNullable().references("id").inTable("sale_listings").onDelete("CASCADE");
    table.string("reporter_user_id", 34).notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("reason", 20).notNullable(); // not_available | wrong_details | scam | duplicate | other
    table.text("note").nullable();
    table.string("status", 10).notNullable().defaultTo("open"); // open | dismissed | actioned
    table.string("resolved_by", 34).nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    table.timestamp("resolved_at", { useTz: true }).nullable();
    addTimestamps(knex, table);
    table.index(["status", "created_at"]);
    table.index(["sale_listing_id"]);
    table.unique(["sale_listing_id", "reporter_user_id"]);
  });

  await knex.schema.alterTable("vehicles", (table) => {
    table.timestamp("sold_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("vehicles", (table) => {
    table.dropColumn("sold_at");
  });
  await knex.schema.dropTableIfExists("sale_listing_reports");
  await knex.schema.dropTableIfExists("sale_enquiries");
  await knex.schema.dropTableIfExists("sale_review_checks");
  await knex.raw(`DELETE FROM documents WHERE sale_listing_id IS NOT NULL`);
  await knex.raw(`ALTER TABLE documents DROP CONSTRAINT documents_one_owner_chk`);
  await knex.raw(`
    ALTER TABLE documents
    ADD CONSTRAINT documents_one_owner_chk
    CHECK ((merchant_id IS NOT NULL) <> (user_id IS NOT NULL))
  `);
  await knex.schema.alterTable("documents", (table) => {
    table.dropIndex(["sale_listing_id"]);
    table.dropColumn("slot");
    table.dropColumn("sale_listing_id");
  });
  await knex.schema.dropTableIfExists("sale_ref_daily_counters");
  await knex.schema.dropTableIfExists("sale_listings");
}

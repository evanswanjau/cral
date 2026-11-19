import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Phase 6 CS2 - Ops review of sale listings and report-a-listing
 * (docs/decisions/car-sales.md, openapi/admin-sales.yaml,
 * openapi/customer-sales.yaml).
 *
 * - `sale_listing_review_checks`: one answer per (listing, item), the shape
 *   of `outlet_review_checks`. Items in `platform_settings`
 *   (`sale_review.checklist`). A human compares the logbook with the
 *   listing and the account; there is no OCR and no automatic check.
 * - `sale_listing_reports` (`slr_`): a signed-in buyer reports a live
 *   listing. One open report per buyer per listing (partial unique index).
 *   Ops dismisses it, or pauses / takes the listing down, which closes
 *   every open report on that listing.
 */

const SALE_CHECKLIST = [
  {
    id: "logbook_owner",
    group: "Logbook",
    document: "logbook",
    severity: "block",
    label: "Logbook owner is this merchant",
    help: "The registered owner on the logbook is the merchant's own name, or the company's for a company account. Compare by eye with the account shown above.",
    changes_phrase: "The logbook is not in your name or your company's. Upload the logbook for this car in the account holder's name.",
    reject_phrase: "The logbook shows a different owner from this account.",
  },
  {
    id: "logbook_vehicle",
    group: "Logbook",
    document: "logbook",
    severity: "block",
    label: "Make, model and plate match the logbook",
    help: "The registration, make and model typed on the listing are the ones on the logbook.",
    changes_phrase: "The make, model or registration on your listing does not match the logbook. Correct the listing to match.",
    reject_phrase: "The listing does not describe the car on the logbook.",
  },
  {
    id: "logbook_encumbrance",
    group: "Logbook",
    document: "logbook",
    severity: "block",
    label: "Bank interest disclosed truthfully",
    help: "A bank or lender named on the logbook means the listing must say the car is financed (encumbered).",
    changes_phrase: "Your logbook shows a lender. Mark the listing as financed so buyers know before they view.",
    reject_phrase: "The listing hides a lender shown on the logbook.",
  },
  {
    id: "photos_this_car",
    group: "Photos",
    document: "photos",
    severity: "block",
    label: "Photos are of this car",
    help: "At least one photo shows the plate, and it matches the registration. No stock, borrowed or edited photos.",
    changes_phrase: "Your photos don't show this car's number plate. Add a clear photo with the plate visible.",
    reject_phrase: "The photos are not of the car on the logbook.",
  },
  {
    id: "photos_clear",
    group: "Photos",
    document: "photos",
    severity: "flag",
    label: "Photos are clear and show the car fairly",
    help: "Outside from all sides and the inside, in daylight. Damage the seller declared is not hidden.",
    changes_phrase: "Some photos are dark or blurred, or a side of the car is missing. Retake them in daylight.",
    reject_phrase: "",
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sale_listing_review_checks", (table) => {
    table.string("sale_listing_id", 34).notNullable().references("id").inTable("sale_listings").onDelete("CASCADE");
    table.string("item_id", 40).notNullable();
    table.string("result", 10).notNullable().defaultTo("pending"); // pending | pass | flag
    table.text("note").nullable();
    table.string("checked_by", 34).nullable(); // admin_users.id
    table.timestamp("checked_at", { useTz: true }).nullable();
    addTimestamps(knex, table);
    table.primary(["sale_listing_id", "item_id"]);
  });

  await knex.schema.createTable("sale_listing_reports", (table) => {
    addId(table);
    table.string("sale_listing_id", 34).notNullable().references("id").inTable("sale_listings").onDelete("CASCADE");
    table.string("user_id", 34).nullable().references("id").inTable("users").onDelete("SET NULL");
    // scam | not_this_car | wrong_details | already_sold | offensive | other
    table.string("reason", 20).notNullable();
    table.text("details").nullable();
    // open | dismissed | actioned
    table.string("status", 12).notNullable().defaultTo("open");
    table.string("handled_by", 34).nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    table.timestamp("handled_at", { useTz: true }).nullable();
    table.text("handled_note").nullable();
    addTimestamps(knex, table);
    table.index(["status", "created_at"]);
    table.index(["sale_listing_id", "status"]);
  });
  await knex.raw(
    `ALTER TABLE sale_listing_reports ADD CONSTRAINT sale_listing_reports_status_check
       CHECK (status IN ('open', 'dismissed', 'actioned'))`,
  );
  await knex.raw(`
    CREATE UNIQUE INDEX sale_listing_reports_one_open
    ON sale_listing_reports (sale_listing_id, user_id)
    WHERE status = 'open'
  `);

  await knex("platform_settings").insert({ key: "sale_review.checklist", value: JSON.stringify(SALE_CHECKLIST) });
}

export async function down(knex: Knex): Promise<void> {
  await knex("platform_settings").where({ key: "sale_review.checklist" }).delete();
  await knex.schema.dropTableIfExists("sale_listing_reports");
  await knex.schema.dropTableIfExists("sale_listing_review_checks");
}

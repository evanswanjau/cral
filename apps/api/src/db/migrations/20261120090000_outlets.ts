import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Outlets (Phase 4, PR GS1 of `docs/plans/verticals-roadmap.md`; decisions
 * in `docs/decisions/garage.md`; contracts `openapi/merchant-outlets.yaml`
 * and `openapi/admin-outlets.yaml`).
 *
 *  - `outlets` (`out_`): a merchant's physical premises. `kind` is
 *    `garage` now; `parts` arrives with PT1, so the CHECK already allows
 *    it. A merchant can have several. Gates, the same two as a driver:
 *    account approved -> outlet approved (Ops `outlets` queue). A merchant
 *    offers garage services by having an approved garage outlet; there is
 *    still no `offers` column.
 *  - The visit is a record, not a badge: `visited_on` / `visited_by` are
 *    written only when a reviewer passes the `visit_done` checklist item,
 *    with `visit_recorded_by` naming that reviewer. Nothing shows
 *    "visited" without them.
 *  - `details_updated_at`: when the address-level details last changed.
 *    Checklist answers about the premises older than this read `pending`
 *    again (same derived-staleness rule as a re-uploaded document).
 *  - `outlet_photos` (`olp_`): kept out of `documents` on purpose. Account
 *    document queries filter `vehicle_id` / `driver_id` null; a photo with
 *    neither set would read as an account document.
 *  - `outlet_review_checks`: one answer per (outlet, item), the shape of
 *    `vehicle_review_checks`. Item definitions in `platform_settings`
 *    (`outlet_review.checklist`).
 *  - `merchants.garage_only`: someone with no vehicle who signs up for
 *    garage services only. Waives onboarding's "at least one vehicle", the
 *    same way `drivers_only` does.
 */

const OUTLET_CHECKLIST = [
  {
    id: "visit_done",
    group: "Visit",
    document: "premises",
    severity: "block",
    label: "Premises visited",
    help: "Pass this only after someone from CRAL has been to the address. Record who went and the date.",
    changes_phrase: "We could not visit your premises at the address you gave. Check the address and how to find it.",
    reject_phrase: "We could not find working premises at the address you gave.",
  },
  {
    id: "visit_address",
    group: "Visit",
    document: "premises",
    severity: "block",
    label: "Address and county match the visit",
    help: "The place visited is the address and county the merchant typed.",
    changes_phrase: "The address on your premises does not match where we found you. Correct the address.",
    reject_phrase: "The address given is not where the business operates.",
  },
  {
    id: "visit_name",
    group: "Visit",
    document: "premises",
    severity: "flag",
    label: "Business name on site",
    help: "The name on the premises, or a sign a customer would find, matches the outlet name.",
    changes_phrase: "The name on your premises does not match the name you gave. Use the name customers see on site.",
    reject_phrase: "",
  },
  {
    id: "visit_services",
    group: "Visit",
    document: "premises",
    severity: "block",
    label: "Bays, tools and staff fit the services listed",
    help: "Each service ticked is something this garage can do on site today.",
    applies_when: "garage",
    changes_phrase: "Some services you listed are not offered at these premises. Untick the ones you don't do.",
    reject_phrase: "These premises are not set up to do garage work.",
  },
  {
    id: "visit_hours",
    group: "Visit",
    document: "premises",
    severity: "flag",
    label: "Opening hours look right",
    help: "The hours match what was seen or asked on the visit.",
    changes_phrase: "Check your opening hours. They don't match what we were told on the visit.",
    reject_phrase: "",
  },
  {
    id: "photos_real",
    group: "Photos",
    document: "photos",
    severity: "block",
    label: "Photos are of these premises",
    help: "Compare with the visit. No stock, borrowed or old photos.",
    changes_phrase: "Your photos are not of these premises. Take new ones on site: the front with your sign, and where the work is done.",
    reject_phrase: "The photos provided are not of these premises.",
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("outlets", (table) => {
    addId(table);
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");
    table.string("kind", 10).notNullable();
    table.string("name", 120).notNullable();
    table.text("address").notNullable();
    table.string("county", 60).notNullable();
    table.string("phone", 20).nullable();
    table.string("opening_hours", 200).notNullable();
    // Garage service types (`service`, `diagnostics`, ...); empty for parts.
    table.specificType("service_types", "text[]").notNullable().defaultTo("{}");

    // draft | pending | review | action | rejected | live | paused
    table.string("status", 20).notNullable().defaultTo("draft");
    table.text("reviewer_note").nullable();
    table.string("review_assignee", 34).nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    table.timestamp("submitted_at", { useTz: true }).nullable();
    table.timestamp("decided_at", { useTz: true }).nullable();
    table.timestamp("details_updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.date("visited_on").nullable();
    table.string("visited_by", 120).nullable();
    table.string("visit_recorded_by", 34).nullable().references("id").inTable("admin_users").onDelete("SET NULL");

    addTimestamps(knex, table);
    table.index(["merchant_id", "created_at"]);
    table.index(["status", "submitted_at"]);
  });
  await knex.raw(`ALTER TABLE outlets ADD CONSTRAINT outlets_kind_check CHECK (kind IN ('garage', 'parts'))`);
  await knex.raw(
    `ALTER TABLE outlets ADD CONSTRAINT outlets_status_check
       CHECK (status IN ('draft', 'pending', 'review', 'action', 'rejected', 'live', 'paused'))`,
  );
  await knex.raw(
    `ALTER TABLE outlets ADD CONSTRAINT outlets_visit_check
       CHECK ((visited_on IS NULL) = (visited_by IS NULL))`,
  );

  await knex.schema.createTable("outlet_photos", (table) => {
    addId(table);
    table.string("outlet_id", 34).notNullable().references("id").inTable("outlets").onDelete("CASCADE");
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");
    table.string("storage_key", 500).notNullable();
    table.string("original_name", 255).notNullable();
    table.string("content_type", 100).notNullable();
    table.integer("size_bytes").notNullable();
    addTimestamps(knex, table);
    table.index(["outlet_id", "created_at"]);
  });

  await knex.schema.createTable("outlet_review_checks", (table) => {
    table.string("outlet_id", 34).notNullable().references("id").inTable("outlets").onDelete("CASCADE");
    table.string("item_id", 40).notNullable();
    table.string("result", 10).notNullable().defaultTo("pending"); // pending | pass | flag
    table.text("note").nullable();
    table.string("checked_by", 34).nullable(); // admin_users.id
    table.timestamp("checked_at", { useTz: true }).nullable();
    addTimestamps(knex, table);
    table.primary(["outlet_id", "item_id"]);
  });

  await knex("platform_settings").insert({
    key: "outlet_review.checklist",
    value: JSON.stringify(OUTLET_CHECKLIST),
  });

  await knex.schema.alterTable("merchants", (table) => {
    table.boolean("garage_only").notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("garage_only");
  });
  await knex("platform_settings").where({ key: "outlet_review.checklist" }).delete();
  await knex.schema.dropTableIfExists("outlet_review_checks");
  await knex.schema.dropTableIfExists("outlet_photos");
  await knex.schema.dropTableIfExists("outlets");
}

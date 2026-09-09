import type { Knex } from "knex";
import { addTimestamps } from "../schema-helpers.js";

/**
 * Backing for the admin vehicle-review slice (PR 2).
 *
 *  - `documents` gains the review trail. `review_state` already exists
 *    (`ok | pending | expiring | rejected`, from 20260826160000) and the
 *    merchant portal already renders `ok` as "ACCEPTED" — nothing has ever
 *    *set* it. The admin Accept/Reject now does, and records who and when,
 *    plus the note that a rejection quotes to the merchant verbatim.
 *  - `vehicles.review_assignee` — the reviewer a case is assigned to
 *    ("Assign to me" / "With you"). Points at `admin_users`; null when
 *    unassigned.
 *  - `platform_settings` — a small key/value store so the review SLA, the
 *    automatic-check toggles and the required-document set are configurable
 *    rather than hardcoded (the design's Settings → Review rules screen
 *    edits these later). Seeded here with the current behaviour as the
 *    defaults; no UI and no endpoints in this slice.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("documents", (table) => {
    table.text("review_note").nullable();
    table.string("reviewed_by", 34).nullable(); // admin_users.id
    table.timestamp("reviewed_at", { useTz: true }).nullable();
  });

  await knex.schema.alterTable("vehicles", (table) => {
    table
      .string("review_assignee", 34)
      .nullable()
      .references("id")
      .inTable("admin_users")
      .onDelete("SET NULL");
    table.index(["review_assignee"]);
  });

  await knex.schema.createTable("platform_settings", (table) => {
    table.string("key", 60).primary();
    table.jsonb("value").notNullable();
    addTimestamps(knex, table);
  });

  await knex("platform_settings").insert([
    {
      // "Merchants see this as a promise the moment they submit." Drives the
      // queue's overdue banner and the case screen's age pill (48h = past,
      // ~30h = due today, both derived from this).
      key: "vehicle_review.sla_days",
      value: JSON.stringify(2),
    },
    {
      // The automatic checks that run on a submission. Each is advisory —
      // "they guide the eye, they do not decide". `logbook_name_match` is
      // deliberately NOT here: it needs OCR this product doesn't have, so
      // the case screen shows the account name as context for a human to
      // compare, never a computed verdict.
      key: "vehicle_review.auto_checks",
      value: JSON.stringify(["plate_format", "duplicate_plate", "insurance_expiry"]),
    },
    {
      // Every document line that must be Accepted before a listing can go
      // live. The three per-vehicle docs plus the merchant's own two —
      // accepting an account doc once carries across all that merchant's
      // vehicles. `driving_licence` is omitted: the merchant portal never
      // collects one, so there is nothing to review (deferred, see the
      // plan's finding §4).
      key: "vehicle_review.required_document_kinds",
      value: JSON.stringify([
        "logbook",
        "comprehensive_insurance",
        "tracker_certificate",
        "national_id",
        "kra_pin",
      ]),
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("platform_settings");
  await knex.schema.alterTable("vehicles", (table) => {
    table.dropColumn("review_assignee");
  });
  await knex.schema.alterTable("documents", (table) => {
    table.dropColumn("review_note");
    table.dropColumn("reviewed_by");
    table.dropColumn("reviewed_at");
  });
}

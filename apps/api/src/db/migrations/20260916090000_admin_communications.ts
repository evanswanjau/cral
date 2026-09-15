import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Admin (Ops) console — Communications: Bulk Email/SMS, Templates, Logs.
 * Design authority: "Cruz Admin Communications.dc.html", pulled from the
 * bundle after the owner named the screen directly (2026-09-16) — a first
 * pass had missed it. See docs/plans/admin-communications.md.
 *
 * A bulk send does NOT go through the merchant-facing `notify()` /
 * `notifications` table — that pipeline is per-category, per-merchant-
 * preference, quiet-hours aware, and modelled around real product events
 * (a booking, a payout). This is a deliberate admin broadcast tool with its
 * own audience/channel controls, so it talks to the SMS/email adapters
 * directly (see jobs/comms-bulk-send.ts), the same adapters
 * notification-delivery.ts uses.
 */
export async function up(knex: Knex): Promise<void> {
  // A merchant's own choice, once the merchant portal grows a matching
  // toggle - nothing sets this yet, same footing as merchants.approved_at
  // before account approval existed. Separate from `notification_
  // preferences` (per-category, product-event opt-in/out) - this is
  // specifically "don't include me in a bulk SMS blast".
  await knex.schema.alterTable("merchants", (table) => {
    table.boolean("sms_opt_out").notNullable().defaultTo(false);
  });

  await knex.schema.createTable("comms_templates", (table) => {
    addId(table);
    table.string("label", 120).notNullable();
    table.string("channel", 10).notNullable().checkIn(["sms", "email", "both"]);
    table.string("subject", 200).nullable(); // email-only
    table.text("body").notNullable();
    table.string("created_by", 34).nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    table.integer("use_count").notNullable().defaultTo(0);
    table.timestamp("last_used_at", { useTz: true }).nullable();
    addTimestamps(knex, table);
  });

  await knex.schema.createTable("comms_runs", (table) => {
    addId(table);
    table.string("audience_key", 30).notNullable();
    table.string("channel", 10).notNullable().checkIn(["sms", "email", "both"]);
    table.string("subject", 200).nullable();
    table.text("body").notNullable();
    table
      .string("template_id", 34)
      .nullable()
      .references("id")
      .inTable("comms_templates")
      .onDelete("SET NULL");
    table.integer("recipient_count").notNullable();
    table.integer("sent_count").notNullable().defaultTo(0);
    table.integer("failed_count").notNullable().defaultTo(0);
    table.string("status", 12).notNullable().defaultTo("sending").checkIn(["sending", "done"]);
    table.string("sent_by", 34).notNullable().references("id").inTable("admin_users").onDelete("RESTRICT");
    table.timestamp("completed_at", { useTz: true }).nullable();
    addTimestamps(knex, table);
    table.index(["created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("comms_runs");
  await knex.schema.dropTableIfExists("comms_templates");
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("sms_opt_out");
  });
}

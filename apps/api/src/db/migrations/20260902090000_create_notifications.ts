import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Merchant portal Notifications, frozen in
 * openapi/merchant-notifications.yaml. Built at the owner's explicit
 * request on the same ahead-of-plan footing as Bookings and Payouts — see
 * CLAUDE.md's "Recorded product decisions".
 *
 * Two taxonomies live here on purpose (both documented in the contract):
 *
 *  - `category` is what a merchant's channel preferences key off — the five
 *    rows the Settings design shows plus `rating` (the design's Alerts
 *    matrix has no ratings row even though the feed shows rating
 *    notifications, so it is added here as a real category).
 *  - `kind` is what the feed's filter pills and the row icon key off — the
 *    four `KIND` groups from "Cruz Merchant Notifications.dc.html"
 *    (hire / money / doc / rate).
 *
 * The service maps one to the other: booking/return -> hire, payout ->
 * money, review/expiry -> doc, rating -> rate.
 *
 * Delivery over SMS/email is a separate concern (jobs/notification-delivery
 * .ts); this table is the in-app feed and the durable record. Rows are kept
 * 90 days — the daily reminder sweep purges older ones so the feed footer's
 * "Kept for 90 days" is a policy something enforces, not a claim.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("notifications", (table) => {
    addId(table);

    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");

    // booking | payout | review | expiry | return | rating — drives the
    // merchant's channel preferences.
    table.string("category", 20).notNullable();
    // hire | money | doc | rate — drives the feed's filter pills and icon.
    table.string("kind", 10).notNullable();

    table.string("title", 200).notNullable();
    table.text("body").notNullable();

    // The plated reference shown on the row (e.g. "CB-2841" / "PAY-0918" /
    // "KDL 559X"). Nullable — a merchant-level notice has none.
    table.string("ref", 40).nullable();

    // Where the row's "{{cta}} ›" link goes. Both nullable: a merchant-level
    // notice has nowhere to go, and its row renders without a CTA.
    // booking | vehicle | payout_run | merchant
    table.string("subject_type", 20).nullable();
    table.string("subject_id", 34).nullable();

    // When the underlying event happened (not necessarily when the row was
    // written — a swept expiry notice is dated to the event).
    table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("read_at", { useTz: true }).nullable();

    addTimestamps(knex, table);

    // Backs the cursor: ORDER BY occurred_at DESC, id DESC.
    table.index(["merchant_id", "occurred_at", "id"]);
    // Backs the unread badge count and the "Unread" filter.
    table.index(["merchant_id"], "notifications_unread_idx", {
      predicate: knex.whereRaw("read_at is null"),
    });
  });

  await knex.schema.createTable("notification_preferences", (table) => {
    addId(table);

    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");
    // One row per (merchant, category). Missing row -> the category's
    // built-in default (resolved in the service).
    table.string("category", 20).notNullable();
    table.unique(["merchant_id", "category"]);

    // In-app delivery is unconditional and not represented here. These two
    // are the toggles the Settings matrix shows.
    table.boolean("sms").notNullable();
    table.boolean("email").notNullable();

    addTimestamps(knex, table);
  });

  // Quiet hours are per-account, not per-category, so they live on the
  // merchant rather than in notification_preferences. Held booking alerts
  // are re-sent when the window closes; payout and reviewer messages
  // bypass it (per the design).
  await knex.schema.alterTable("merchants", (table) => {
    table.boolean("quiet_hours_enabled").notNullable().defaultTo(false);
    // "HH:MM" local (Nairobi) wall-clock, the same shape the design's
    // <input type="time"> round-trips. Nullable until the merchant sets them.
    table.string("quiet_from", 5).nullable();
    table.string("quiet_until", 5).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("quiet_hours_enabled");
    table.dropColumn("quiet_from");
    table.dropColumn("quiet_until");
  });
  await knex.schema.dropTableIfExists("notification_preferences");
  await knex.schema.dropTableIfExists("notifications");
}

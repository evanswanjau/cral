import type { Knex } from "knex";
import { addId, addMoneyColumn, addTimestamps } from "../schema-helpers.js";

/**
 * The bookings domain (spec §14-16, §19-20), frozen in
 * openapi/merchant-bookings.yaml. Built ahead of the delivery plan's
 * Phase 4-6 sequencing at the owner's explicit request — see CLAUDE.md's
 * "Recorded product decisions" for the reduced-handover and deposit-
 * formula deviations from the platform spec this implies.
 *
 * No `disputes` table yet — that is Phase 6+ and genuinely out of scope
 * here. `booking_reports.escalated_dispute_id` is a bare nullable string,
 * not a foreign key, so a real disputes table can adopt these rows later
 * without a migration on this table.
 */
export async function up(knex: Knex): Promise<void> {
  // Backs `ref` ("CB-2841") — a human reference, not a PK, same pattern as
  // vehicle_listing_ref_seq. Started past every ref in the design mockups
  // so seeded/demo data never collides with a screenshot's literal number.
  await knex.raw("CREATE SEQUENCE IF NOT EXISTS booking_ref_seq START 2900");

  await knex.schema.createTable("bookings", (table) => {
    addId(table);
    table.string("ref", 20).notNullable().unique();

    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");
    table.string("vehicle_id", 34).notNullable().references("id").inTable("vehicles").onDelete("RESTRICT");
    table.string("hirer_id", 34).notNullable().references("id").inTable("users").onDelete("RESTRICT");

    // requested | confirmed | active | completed | declined | expired | cancelled
    table.string("status", 20).notNullable().defaultTo("requested");

    table.timestamp("pickup_at", { useTz: true }).notNullable();
    table.timestamp("dropoff_at", { useTz: true }).notNullable();
    table.string("pickup_location", 300).notNullable();
    table.string("dropoff_location", 300).notNullable();
    table.text("note_from_hirer").nullable();

    addMoneyColumn(table, "gross");
    addMoneyColumn(table, "commission");
    addMoneyColumn(table, "merchant_net");
    addMoneyColumn(table, "deposit");
    addMoneyColumn(table, "cancellation_fee", { nullable: true });
    addMoneyColumn(table, "refund", { nullable: true });

    // Snapshot of the merchant's payout destination at booking time, same
    // reasoning as vehicles snapshotting price at booking time in spec §14
    // ("vehicle snapshot at booking time") — a later payout-detail change
    // must not retroactively alter a completed booking's own record.
    table.string("payout_method", 10).notNullable().defaultTo("mpesa");
    table.string("payout_detail", 20).notNullable();
    table.string("payout_account_name", 150).notNullable();

    // 12h response window (spec §14), null once answered.
    table.timestamp("response_due_at", { useTz: true }).nullable();

    table.string("decline_reason_code", 40).nullable();
    table.text("decline_note").nullable();
    table.text("cancel_reason").nullable();

    table.boolean("has_pickup_condition_photos").notNullable().defaultTo(false);

    // The moment the return handover actually completed — the anchor for
    // both the 14-day report/rating windows and deposit_release_at below.
    // Kept as its own column rather than back-computed from
    // deposit_release_at, because that column moves (see next comment) and
    // a derived anchor would silently move with it.
    table.timestamp("returned_at", { useTz: true }).nullable();

    // Two clocks, not a conflict: 24h is the normal release
    // (design's "clears 24 hours after you receive the vehicle back");
    // filing a claim extends it to 48h from returned_at while CRAL
    // reviews it (design's "CRAL holds the deposit for 48 hours while a
    // claim is reviewed"). createBookingReport bumps this on a claim.
    table.timestamp("deposit_release_at", { useTz: true }).nullable();
    // Not yet written anywhere — release is a payout-job concern (Payouts
    // screen, out of Phase 1 scope per CLAUDE.md). Until that job exists,
    // "held" is determined purely by `now < deposit_release_at`; this
    // column is a deliberate placeholder for when it does.
    table.boolean("deposit_released").notNullable().defaultTo(false);

    // 14-day rating window, opened when the return handover completes.
    table.timestamp("rating_open_until", { useTz: true }).nullable();

    addTimestamps(knex, table);

    table.index(["merchant_id", "status"]);
    table.index(["hirer_id"]);
  });

  await knex.schema.createTable("handovers", (table) => {
    addId(table);
    table.string("booking_id", 34).notNullable().references("id").inTable("bookings").onDelete("CASCADE");

    table.string("kind", 10).notNullable(); // pickup | return
    // created | qr_scanned | otp_sent | otp_verified | condition_logged |
    // confirmed | completed | expired | failed | offline_pending | reconciled
    table.string("state", 20).notNullable().defaultTo("created");

    // qr_scanned is unreachable this phase (no customer app to scan) — see
    // openapi/merchant-bookings.yaml's top-level description. Columns exist
    // now so the real proximity step slots in later without a migration.
    table.string("otp_code_hash", 200).nullable();
    table.integer("otp_attempts").notNullable().defaultTo(0);
    table.timestamp("otp_sent_at", { useTz: true }).nullable();
    table.timestamp("otp_expires_at", { useTz: true }).nullable();
    table.string("masked_destination", 120).nullable();

    table.integer("odometer_km").nullable();
    table.string("fuel_level", 20).nullable(); // empty | quarter | half | three_quarter | full
    table.text("condition_notes").nullable();

    table.timestamp("confirmed_at", { useTz: true }).nullable();
    table.timestamp("completed_at", { useTz: true }).nullable();
    // 20-minute session window (spec §15's handover rules).
    table.timestamp("expires_at", { useTz: true }).notNullable();

    addTimestamps(knex, table);

    table.index(["booking_id"]);
  });

  await knex.schema.createTable("booking_events", (table) => {
    addId(table);
    table.string("booking_id", 34).notNullable().references("id").inTable("bookings").onDelete("CASCADE");
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");
    table.string("kind", 40).notNullable();
    table.string("tone", 10).notNullable(); // grey | blue | green | amber | red
    table.string("label", 160).notNullable();
    table.text("body").nullable();
    table.string("actor_type", 10).notNullable(); // merchant | hirer | system
    table.string("actor_name", 120).nullable();
    table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    addTimestamps(knex, table);
    table.index(["booking_id", "occurred_at"]);
  });

  await knex.schema.createTable("booking_reports", (table) => {
    addId(table);
    table.string("booking_id", 34).notNullable().references("id").inTable("bookings").onDelete("CASCADE");
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");

    table.string("kind", 10).notNullable(); // claim | conduct
    // damage | fuel_short | late_return | missing_equipment | cleaning | conduct | other
    table.string("category", 20).notNullable();
    table.text("description").notNullable();
    addMoneyColumn(table, "amount", { nullable: true }); // claim only

    table.specificType("evidence_document_ids", "text[]").notNullable().defaultTo("{}");

    // filed | under_review | resolved
    table.string("status", 20).notNullable().defaultTo("filed");
    // Set once a claim exceeds the deposit held. No FK — see the file
    // header note on why disputes isn't a real table yet.
    table.string("escalated_dispute_id", 34).nullable();

    addTimestamps(knex, table);
    table.index(["booking_id"]);
  });

  // documents already holds owner/vehicle uploads (spec §9); handover
  // condition photos reuse it with kind='handover_photo' rather than a
  // parallel photo-storage table, same call the Vehicles screen made for
  // vehicle_photo.
  await knex.schema.alterTable("documents", (table) => {
    table.string("booking_id", 34).nullable().references("id").inTable("bookings").onDelete("CASCADE");
    table.index(["booking_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("documents", (table) => {
    table.dropColumn("booking_id");
  });
  await knex.schema.dropTableIfExists("booking_reports");
  await knex.schema.dropTableIfExists("booking_events");
  await knex.schema.dropTableIfExists("handovers");
  await knex.schema.dropTableIfExists("bookings");
  await knex.raw("DROP SEQUENCE IF EXISTS booking_ref_seq");
}

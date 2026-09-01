import type { Knex } from "knex";
import { addId, addMoneyColumn, addTimestamps } from "../schema-helpers.js";

/**
 * The payouts domain, frozen in openapi/merchant-payouts.yaml. Built at the
 * owner's explicit request alongside the Bookings slice, ahead of the
 * delivery plan's Phase 4-6 sequencing — see CLAUDE.md's "Recorded product
 * decisions".
 *
 * There is no payment rail. Daraja/M-Pesa B2C is not integrated and nothing
 * in this codebase disburses money, so a run is created `scheduled` and only
 * reaches `paid` when something outside the API says so (today the dev-seed,
 * later a Daraja callback). `provider_code` holds the Safaricom transaction
 * code and stays null until then.
 *
 * No `payout_batches` / ledger table: a run *is* the batch, and a
 * double-entry ledger is a Phase 6+ concern that would be speculative built
 * against a rail that doesn't exist yet.
 */
export async function up(knex: Knex): Promise<void> {
  // Backs `ref` ("PAY-0912") — a human reference, not a PK, same pattern as
  // booking_ref_seq and vehicle_listing_ref_seq. Started past every ref in
  // the design mockups (highest is PAY-0918) so seeded data never collides
  // with a screenshot's literal number.
  await knex.raw("CREATE SEQUENCE IF NOT EXISTS payout_run_ref_seq START 900");

  await knex.schema.createTable("payout_runs", (table) => {
    addId(table);
    table.string("ref", 20).notNullable().unique();

    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");

    // scheduled | processing | paid | failed
    table.string("status", 20).notNullable().defaultTo("scheduled");

    // The Nairobi calendar day the run goes out. A plain date, not a
    // timestamp: spec §2 stores instants in UTC, but a payout run is a
    // banking *day*, and 00:30 EAT must not land on the previous day.
    table.date("run_date").notNullable();

    // Totals, always the sum of this run's own line snapshots — never
    // recomputed from COMMISSION_RATE. A rate change must not rewrite what
    // a merchant was already paid.
    addMoneyColumn(table, "gross");
    addMoneyColumn(table, "commission");
    addMoneyColumn(table, "net");

    // Snapshot of where the money went, for the same reason bookings
    // snapshot theirs — changing your payout number later must not rewrite
    // the record of a run that already left.
    table.string("destination_method", 10).notNullable().defaultTo("mpesa");
    table.string("destination_detail", 20).notNullable();
    table.string("destination_account_name", 150).notNullable();

    table.string("provider_code", 40).nullable();
    table.timestamp("paid_at", { useTz: true }).nullable();

    addTimestamps(knex, table);

    // Backs the cursor: ORDER BY run_date DESC, id DESC.
    table.index(["merchant_id", "run_date", "id"]);
  });

  await knex.schema.createTable("payout_run_lines", (table) => {
    addId(table);
    table.string("payout_run_id", 34).notNullable().references("id").inTable("payout_runs").onDelete("CASCADE");

    // RESTRICT, not CASCADE: a booking must not be able to vanish out from
    // under a payout line that says it was paid for. Nullable so a future
    // archival process can detach the booking while the line survives.
    table.string("booking_id", 34).nullable().references("id").inTable("bookings").onDelete("RESTRICT");

    // A booking pays out exactly once, across every run and every merchant.
    // This unique index is the real guard — the service checks first for a
    // clean error, but the constraint is what makes a double-pay impossible
    // under concurrency.
    table.unique(["booking_id"]);

    // Denormalised so a line still renders if the booking is later
    // archived — the merchant's own payment record must not depend on rows
    // owned by another domain.
    table.string("booking_ref", 20).notNullable();
    table.string("hirer_name", 200).notNullable();
    table.string("vehicle_registration", 20).notNullable();
    table.timestamp("pickup_at", { useTz: true }).notNullable();
    table.timestamp("dropoff_at", { useTz: true }).notNullable();

    addMoneyColumn(table, "gross");
    addMoneyColumn(table, "commission");
    addMoneyColumn(table, "net");

    addTimestamps(knex, table);

    table.index(["payout_run_id"]);
  });

  await knex.schema.createTable("payout_queries", (table) => {
    addId(table);
    table.string("payout_run_id", 34).notNullable().references("id").inTable("payout_runs").onDelete("CASCADE");
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");

    table.text("message").notNullable();
    // filed | answered
    table.string("status", 20).notNullable().defaultTo("filed");
    table.text("response").nullable();

    addTimestamps(knex, table);

    table.index(["payout_run_id"]);
    table.index(["merchant_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("payout_queries");
  await knex.schema.dropTableIfExists("payout_run_lines");
  await knex.schema.dropTableIfExists("payout_runs");
  await knex.raw("DROP SEQUENCE IF EXISTS payout_run_ref_seq");
}

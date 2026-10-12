import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Co-op's B2B IPN was the wrong onboarding route (Co-op, 2026-10-02): the
 * integration is their Co-op Connect APIs, whose results come back on a
 * per-request callback URL instead. The endpoint that wrote this table is
 * gone, and nothing ever reconciled against it, so the table goes too.
 * `20260929090000` stays in history; it already ran on every environment.
 *
 * `down` recreates the table exactly as that migration built it, so a
 * rollback leaves the schema where it was.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("bank_account_events");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable("bank_account_events", (table) => {
    addId(table);
    table.string("provider", 20).notNullable();
    table.string("transaction_id", 64).notNullable();
    table.string("account_no", 34).notNullable();
    table.string("event_type", 6).notNullable();
    table.bigInteger("amount_amount").notNullable();
    table.specificType("amount_currency", "char(3)").notNullable();
    table.bigInteger("booked_balance_amount").nullable();
    table.bigInteger("cleared_balance_amount").nullable();
    table.string("payment_ref", 64).nullable();
    table.text("narration").nullable();
    table.text("cust_memo_line1").nullable();
    table.text("cust_memo_line2").nullable();
    table.text("cust_memo_line3").nullable();
    table.string("exchange_rate", 32).nullable();
    table.date("transaction_date").nullable();
    table.date("posting_date").nullable();
    table.date("value_date").nullable();
    table.jsonb("payload").notNullable();
    addTimestamps(knex, table);
    table.unique(["provider", "transaction_id"]);
    table.index(["payment_ref"]);
  });
  await knex.raw(
    "ALTER TABLE bank_account_events ADD CONSTRAINT bank_account_events_event_type_check " +
      "CHECK (event_type IN ('credit', 'debit'))",
  );
}

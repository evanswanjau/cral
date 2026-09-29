import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Co-op Bank's account-event notifications ("B2B IPN"): every debit and
 * credit on CRAL's account, pushed to `POST /payments/coopbank/ipn` as it
 * posts. Stored as received; nothing reconciles against bookings yet.
 *
 * Money is `bigint` cents rather than `addMoneyColumn`'s `integer`: these
 * are bank-account movements and balances, not one hire, and an integer
 * column tops out at KES 21.4M - a larger credit would fail the insert,
 * be answered non-2xx, and be redelivered by the bank until it gives up.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("bank_account_events", (table) => {
    addId(table);
    table.string("provider", 20).notNullable();
    // The bank's own id for the event - what a redelivery repeats.
    table.string("transaction_id", 64).notNullable();
    table.string("account_no", 34).notNullable();
    table.string("event_type", 6).notNullable();
    table.bigInteger("amount_amount").notNullable();
    table.specificType("amount_currency", "char(3)").notNullable();
    // The bank masks these in its own sample ("xx.9"), so either may be absent.
    table.bigInteger("booked_balance_amount").nullable();
    table.bigInteger("cleared_balance_amount").nullable();
    table.string("payment_ref", 64).nullable();
    table.text("narration").nullable();
    table.text("cust_memo_line1").nullable();
    table.text("cust_memo_line2").nullable();
    table.text("cust_memo_line3").nullable();
    table.string("exchange_rate", 32).nullable();
    // The bank sends dates with an offset and no time ("2023-11-06+03:00").
    table.date("transaction_date").nullable();
    table.date("posting_date").nullable();
    table.date("value_date").nullable();
    // The body exactly as received, for anything the columns above lose.
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

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable("bank_account_events");
}

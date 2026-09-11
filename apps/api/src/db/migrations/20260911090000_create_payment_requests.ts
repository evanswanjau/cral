import type { Knex } from "knex";
import { addId, addMoneyColumn, addTimestamps } from "../schema-helpers.js";

/**
 * One STK-push attempt against a booking (owner's call 2026-09-11: M-Pesa
 * via Cooperative Bank's gateway, see apps/api/src/adapters/payment/).
 * "payment" already has a reserved prefix in the platform spec's own
 * identifier list (`pay_`) - this is the first table to use it.
 *
 * A booking can have more than one row here (a declined prompt, a retry),
 * which is why this isn't a column on `bookings` itself - `bookings`
 * always points at whichever row last succeeded via `payment_request_id`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("payment_requests", (table) => {
    addId(table);

    table
      .string("booking_id", 34)
      .notNullable()
      .references("id")
      .inTable("bookings")
      .onDelete("CASCADE");

    // deposit | full — which figure this push was for. Money is still
    // whatever the booking quoted; this table never invents its own.
    table.string("purpose", 20).notNullable();
    addMoneyColumn(table, "amount");
    table.string("phone", 20).notNullable();

    // pending | success | failed | cancelled. "pending" until the
    // provider's async callback lands (or never does, per expires_at).
    table.string("status", 12).notNullable().defaultTo("pending");
    table.string("provider", 20).notNullable().defaultTo("coopbank");

    // CheckoutRequestID (or equivalent) from the initiate call — unique so
    // the callback handler can look the row up and can't be replayed onto
    // a second row.
    table.string("provider_request_id", 100).unique();
    // The provider's own receipt number once paid (e.g. an M-Pesa code) —
    // what a merchant/renter would recognise from their own M-Pesa message.
    table.string("provider_receipt", 40);
    table.jsonb("raw_callback");
    table.text("failure_reason");

    table.timestamp("expires_at", { useTz: true }).notNullable();

    addTimestamps(knex, table);
    table.index(["booking_id"]);
    table.index(["status"]);
  });

  await knex.schema.alterTable("bookings", (table) => {
    table
      .string("payment_request_id", 34)
      .nullable()
      .references("id")
      .inTable("payment_requests")
      .onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("bookings", (table) => {
    table.dropColumn("payment_request_id");
  });
  await knex.schema.dropTableIfExists("payment_requests");
}

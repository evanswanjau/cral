import type { Knex } from "knex";
import { addId, addMoneyColumn, addTimestamps } from "../schema-helpers.js";

/**
 * Money owed back to a renter, and whether it actually went back.
 *
 * Added for the 2026-09-20 call that moved payment ahead of the owner's
 * decision. That call was reversed on 2026-09-21 (a renter pays only
 * after acceptance), so the table is no longer load-bearing for declines
 * - but it stays: a merchant cancelling a booking they were already paid
 * for owes the money back, as does any booking taken under the brief
 * pay-first flow.
 *
 * Before this, `bookings.refund_amount` was the only record and nothing
 * anywhere executed a refund. A column saying what is owed is
 * bookkeeping, not a refund.
 *
 * Its own table rather than a `refunded` status on `payment_requests`: a
 * refund is a separate movement of money that fails on its own terms and
 * is retried without rewriting the record of the payment it reverses -
 * the same reasoning that keeps `payment_requests` off `bookings`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("refunds", (table) => {
    addId(table);

    table.string("booking_id", 34).notNullable().references("id").inTable("bookings").onDelete("CASCADE");
    // The payment being reversed. Kept explicit so a partial or repeated
    // refund can never exceed what that particular payment brought in.
    table
      .string("payment_request_id", 34)
      .notNullable()
      .references("id")
      .inTable("payment_requests")
      .onDelete("RESTRICT");

    addMoneyColumn(table, "amount");
    // Where it goes back to - the line the payment came from, captured at
    // refund time rather than read live, so changing a payout number
    // later cannot redirect an old refund.
    table.string("phone", 20).notNullable();

    // Why the money is going back: declined | expired | merchant_cancelled
    // | hirer_cancelled.
    table.string("reason", 30).notNullable();

    // pending | success | failed. `failed` is a real, expected state: the
    // Co-op adapter has no confirmed reversal endpoint and throws, so
    // today every refund lands here for a human to settle by hand. That
    // is deliberate - a refund that silently "succeeds" would mark a
    // booking settled while the renter's money sat with us.
    table.string("status", 12).notNullable().defaultTo("pending");
    table.string("provider", 20).notNullable().defaultTo("coopbank");
    table.string("provider_ref", 100);
    table.text("failure_reason");

    addTimestamps(knex, table);

    // One refund per booking per reason - a retry updates the row it
    // already has rather than stacking a second obligation for the same
    // event. The constraint is what makes a double-refund impossible
    // under concurrency, not the service's own check.
    table.unique(["booking_id", "reason"]);
    table.index(["status"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("refunds");
}

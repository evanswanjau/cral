import type { Knex } from "knex";
import { addId, addMoneyColumn, addTimestamps } from "../schema-helpers.js";

/**
 * Money CRAL sends out: a merchant's payout run, or a renter's refund,
 * through Co-op Connect (Pesalink to another bank, internal transfer to a
 * Co-op account, or Send to M-Pesa).
 *
 * One row per attempt. The payout run / refund keeps its own status; this
 * is the record of each try at moving the money, so a failed attempt can
 * be retried without rewriting what happened the first time - the same
 * reasoning that keeps `refunds` off `payment_requests`.
 *
 * Written BEFORE the provider is called, same rule as `payment_requests`:
 * a call that succeeded with no row behind it is money gone with nothing
 * to reconcile it against.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("disbursements", (table) => {
    addId(table);

    // payout | refund - exactly one of the two references below is set.
    table.string("kind", 10).notNullable();
    // CASCADE, matching `refunds`/`payout_runs` themselves (both cascade
    // from their booking/merchant): an attempt has no meaning without the
    // thing it pays.
    table.string("payout_run_id", 34).nullable().references("id").inTable("payout_runs").onDelete("CASCADE");
    table.string("refund_id", 34).nullable().references("id").inTable("refunds").onDelete("CASCADE");

    // pesalink | internal | mpesa - which Co-op API carries it.
    table.string("channel", 10).notNullable();
    // Snapshot of where it goes, taken when the attempt is created, so a
    // later change to the merchant's details can't redirect this attempt.
    table.string("destination", 20).notNullable();
    table.string("bank_name", 100).nullable();
    table.string("bank_code", 10).nullable();
    table.string("account_name", 200).nullable();

    // What is owed, in cents. Co-op's transfer APIs take whole shillings,
    // so `sent_shillings` is what actually leaves; any cents below a
    // shilling are recorded, not silently dropped.
    addMoneyColumn(table, "amount");
    table.integer("sent_shillings").notNullable();

    // Our MessageReference (<=27 chars) - echoed in the ack, the callback
    // and Transaction Status.
    table.string("message_reference", 27).notNullable().unique();

    // pending (row written, not yet sent or no usable answer) |
    // processing (Co-op accepted it) | success | failed
    table.string("status", 12).notNullable().defaultTo("pending");
    table.string("provider", 20).notNullable();
    table.string("provider_transaction_id", 60).nullable();
    table.text("failure_reason").nullable();
    table.jsonb("raw_ack").nullable();
    table.jsonb("raw_result").nullable();
    table.timestamp("sent_at", { useTz: true }).nullable();
    table.timestamp("settled_at", { useTz: true }).nullable();

    addTimestamps(knex, table);
    table.index(["status"]);
  });

  await knex.raw(`
    ALTER TABLE disbursements
      ADD CONSTRAINT disbursements_kind_check CHECK (kind IN ('payout', 'refund')),
      ADD CONSTRAINT disbursements_one_subject CHECK (
        (kind = 'payout' AND payout_run_id IS NOT NULL AND refund_id IS NULL) OR
        (kind = 'refund' AND refund_id IS NOT NULL AND payout_run_id IS NULL)
      ),
      ADD CONSTRAINT disbursements_channel_check CHECK (channel IN ('pesalink', 'internal', 'mpesa')),
      ADD CONSTRAINT disbursements_status_check CHECK (status IN ('pending', 'processing', 'success', 'failed'))
  `);

  // At most one live attempt per payout run / refund. A failed attempt
  // frees the slot for a retry; anything else holding it means money may
  // already be on its way. The constraint, not a service check, is what
  // makes paying a run twice impossible under concurrency.
  await knex.raw(`
    CREATE UNIQUE INDEX disbursements_one_live_per_run ON disbursements (payout_run_id)
      WHERE payout_run_id IS NOT NULL AND status <> 'failed'
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX disbursements_one_live_per_refund ON disbursements (refund_id)
      WHERE refund_id IS NOT NULL AND status <> 'failed'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("disbursements");
}

import type { Knex } from "knex";

/**
 * Account lifecycle statuses + self-service deletion (owner's call,
 * 2026-09-03). Replaces the "contact CRAL to close" hand-off.
 *
 *  - `active` — normal.
 *  - `suspended` — cannot sign in. Nothing sets this yet (no admin
 *    portal), same footing as `merchants.approved_at`; the login gate is
 *    in place so an admin tool is a data change, not a code change.
 *  - `pending_deletion` — the merchant asked to delete. All other sessions
 *    are revoked and the app shows a "scheduled for deletion" state, but
 *    the account is recoverable ("Keep my account") until
 *    `erasure_cooling_off_until` (now + 30 days), reusing the Phase-0
 *    column that was created for exactly this.
 *  - `deleted` — the daily sweep has run past the 30 days: PII scrubbed,
 *    sign-in permanently blocked. Bookings, payouts and audit rows are
 *    **kept** — a hirer must still see where they booked and their history.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.string("status", 20).notNullable().defaultTo("active");
    table.timestamp("status_changed_at", { useTz: true }).nullable();
    table.text("suspended_reason").nullable();
  });
  await knex.raw(
    `ALTER TABLE users ADD CONSTRAINT users_status_check
       CHECK (status IN ('active', 'suspended', 'pending_deletion', 'deleted'))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check`);
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("status");
    table.dropColumn("status_changed_at");
    table.dropColumn("suspended_reason");
  });
}

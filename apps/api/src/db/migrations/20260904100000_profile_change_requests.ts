import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Once a merchant has submitted onboarding, the profile fields (name,
 * national ID, KRA PIN, company details) are locked - a mismatch against
 * the logbooks is a real fraud vector, so a change has to be reviewed
 * (owner's call, 2026-09-04).
 *
 * A merchant submits a `profile_change_requests` row with the fields they
 * want changed. Nothing on `merchants` moves until an admin approves it,
 * at which point the diff is applied in one transaction and the account
 * goes back to review (`merchants.approved_at` -> null). There is no admin
 * portal yet, so approval runs through
 * `apps/api/src/scripts/review-profile-change.ts` for now.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("profile_change_requests", (table) => {
    addId(table);
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");
    table.string("requested_by", 34).notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("status", 12).notNullable().defaultTo("pending");
    table.jsonb("changes").notNullable();
    table.string("reviewer_id", 34).nullable();
    table.text("reviewer_note").nullable();
    table.timestamp("decided_at", { useTz: true }).nullable();
    addTimestamps(knex, table);
  });

  await knex.raw(
    `ALTER TABLE profile_change_requests ADD CONSTRAINT profile_change_requests_status_check
       CHECK (status IN ('pending', 'approved', 'rejected'))`,
  );
  // At most one open request per merchant.
  await knex.raw(
    `CREATE UNIQUE INDEX profile_change_requests_one_pending
       ON profile_change_requests (merchant_id) WHERE status = 'pending'`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("profile_change_requests");
}

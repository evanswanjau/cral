import type { Knex } from "knex";

/**
 * A merchant's account-level approval — separate from any single vehicle's
 * review status. Nothing sets this yet (there's no admin portal in Phase
 * 1), but the merchant portal needs to read it: the "approved merchant"
 * banner on a vehicle's Documents card must not show just because both
 * owner documents were uploaded — only once an admin has actually approved
 * the account. Until that exists, `apps/api/src/scripts/approve-merchant.ts`
 * sets this for local testing.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.timestamp("approved_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("approved_at");
  });
}

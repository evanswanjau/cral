import type { Knex } from "knex";

/**
 * Migration A of the customer-portal slice (docs/plans/customer-portal.md).
 *
 * A renter has to upload an ID and a driving licence before they can
 * request a booking, and Ops reviews those the same way it reviews a
 * merchant's documents. Rather than a second table with its own review
 * vocabulary, `documents` gains a nullable `user_id` alongside the existing
 * `merchant_id`: one table, one `review_state`, one decision path.
 *
 * - `merchant_id` becomes nullable (it was NOT NULL).
 * - `user_id` is new, nullable, FK `users`, `ON DELETE CASCADE`.
 * - a CHECK enforces exactly one owner column is set, so a row is either a
 *   merchant/vehicle document or a renter document, never both and never
 *   neither. Every existing row has `merchant_id` set and `user_id` null,
 *   so the constraint holds on the current data.
 * - `driving_licence` is a real `kind` now (it was previously omitted with
 *   a "never collected" note - the renter pipeline is what collects it).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("documents", (table) => {
    table.string("merchant_id", 34).nullable().alter();
    table
      .string("user_id", 34)
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.index(["user_id"]);
  });

  await knex.raw(`
    ALTER TABLE documents
    ADD CONSTRAINT documents_one_owner_chk
    CHECK ((merchant_id IS NOT NULL) <> (user_id IS NOT NULL))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_one_owner_chk");
  await knex.schema.alterTable("documents", (table) => {
    table.dropIndex(["user_id"]);
    table.dropColumn("user_id");
  });
  // Restoring NOT NULL would fail if any renter rows exist; callers of
  // `down` in that state must clear them first. On a clean rollback (no
  // renter docs yet) this succeeds.
  await knex.schema.alterTable("documents", (table) => {
    table.string("merchant_id", 34).notNullable().alter();
  });
}

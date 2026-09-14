import type { Knex } from "knex";

/**
 * Migration B of the customer-portal slice (docs/plans/customer-portal.md,
 * C8) - "so a renter can be notified at all". Same shape as Migration A
 * (20260910100000_renter_documents.ts, which did this for `documents`):
 *
 * - `merchant_id` becomes nullable (it was NOT NULL).
 * - `user_id` is new, nullable, FK `users`, `ON DELETE CASCADE`.
 * - a CHECK enforces exactly one owner column is set - a row is either a
 *   merchant's own notification or a renter's, never both and never
 *   neither. Every existing row has `merchant_id` set and `user_id` null,
 *   so the constraint holds on the current data.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("notifications", (table) => {
    table.string("merchant_id", 34).nullable().alter();
    table
      .string("user_id", 34)
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.index(["user_id", "occurred_at", "id"]);
  });

  await knex.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_one_owner_chk
    CHECK ((merchant_id IS NOT NULL) <> (user_id IS NOT NULL))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_one_owner_chk");
  await knex.schema.alterTable("notifications", (table) => {
    table.dropIndex(["user_id", "occurred_at", "id"]);
    table.dropColumn("user_id");
  });
  // Restoring NOT NULL would fail if any renter rows exist; callers of
  // `down` in that state must clear them first. On a clean rollback (no
  // renter notifications yet) this succeeds.
  await knex.schema.alterTable("notifications", (table) => {
    table.string("merchant_id", 34).notNullable().alter();
  });
}

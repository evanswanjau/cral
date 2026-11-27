import type { Knex } from "knex";

/**
 * One optional photo of a driver (owner's call, 2026-11-27 - PR DR2 of
 * `docs/plans/drivers-that-work.md`).
 *
 * A picture, not a check: it is not a `documents` row, has no review
 * state and no Ops decision, so it lives on `drivers` itself rather than
 * among the licence, ID and KRA PIN (every query over a driver's
 * documents stays as it was). `photo_id` is a prefixed ULID (`fil_`) that
 * changes on every upload, so the public URL changes with the photo and
 * a cached copy never outlives it. All three columns are set together or
 * all null (CHECK).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("drivers", (table) => {
    table.string("photo_id", 34).nullable();
    table.text("photo_storage_key").nullable();
    table.string("photo_content_type", 60).nullable();
  });
  await knex.raw(
    `ALTER TABLE drivers ADD CONSTRAINT drivers_photo_all_or_none_check
       CHECK ((photo_id IS NULL) = (photo_storage_key IS NULL)
          AND (photo_id IS NULL) = (photo_content_type IS NULL))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_photo_all_or_none_check");
  await knex.schema.alterTable("drivers", (table) => {
    table.dropColumn("photo_id");
    table.dropColumn("photo_storage_key");
    table.dropColumn("photo_content_type");
  });
}

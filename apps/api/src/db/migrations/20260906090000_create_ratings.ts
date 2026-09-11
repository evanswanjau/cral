import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Post-hire ratings. Until now `rateHirer` only appended a `booking_events`
 * row with the stars baked into a label string - nothing numeric, nothing
 * aggregatable. This table is the real record (owner's call, 2026-09-05 -
 * round 5), so the hirer's average can show next to their name.
 *
 * One table covers both directions via `ratee_type`:
 *  - `hirer`    - the merchant rating the hirer (the only writer today,
 *                 via `POST /merchant/bookings/:id/rating`).
 *  - `merchant` - a hirer rating the vehicle owner. Nothing writes these
 *                 yet (no customer portal); the column exists so the
 *                 merchant's own "not rated yet" score has somewhere to
 *                 come from, and so the customer portal is a service
 *                 change rather than a migration.
 *
 * `ratee_id` is always a `users.id` (a hirer's, or a merchant owner's).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ratings", (table) => {
    addId(table);

    table.string("booking_id", 34).notNullable().references("id").inTable("bookings").onDelete("CASCADE");
    // The user who left the rating.
    table.string("rater_id", 34).notNullable().references("id").inTable("users").onDelete("RESTRICT");
    // The user being rated (a hirer, or a merchant's owner user).
    table.string("ratee_id", 34).notNullable().references("id").inTable("users").onDelete("RESTRICT");
    // hirer | merchant
    table.string("ratee_type", 10).notNullable();

    table.smallint("stars").notNullable();
    table.text("comment").nullable();

    addTimestamps(knex, table);

    // One rating per rater, per booking, per direction.
    table.unique(["booking_id", "rater_id", "ratee_type"]);
    // Aggregation is always "every rating for this ratee of this type".
    table.index(["ratee_id", "ratee_type"]);
  });

  await knex.raw(`ALTER TABLE ratings ADD CONSTRAINT ratings_stars_range CHECK (stars BETWEEN 1 AND 5)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ratings");
}

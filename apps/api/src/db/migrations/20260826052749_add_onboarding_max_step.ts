import type { Knex } from "knex";

/**
 * The furthest step the merchant has ever reached, tracked separately from
 * `onboarding_step` (which moves back and forth freely as they navigate).
 *
 * It drives which stepper tabs are clickable. It lived only in the frontend
 * until now, so every server round-trip reset it to the current step and a
 * reload silently made already-visited steps unreachable — part of the
 * "my progress is gone" report this migration is fixing.
 *
 * Backfilled from `onboarding_step` so existing merchants keep whatever
 * they had reached rather than dropping back to 1.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.integer("onboarding_max_step").notNullable().defaultTo(1);
  });
  await knex("merchants").update({
    onboarding_max_step: knex.ref("onboarding_step"),
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("onboarding_max_step");
  });
}

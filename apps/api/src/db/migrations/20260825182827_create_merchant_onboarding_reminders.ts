import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Append-only log of stalled-onboarding reminder emails sent (spec §9) —
 * mirrors this repo's audit_log instinct (never mutate/delete history,
 * derive current state by querying it) rather than boolean flags on
 * `merchants`. Eligibility for a tier is "no row for this tier with
 * sent_at >= merchants.last_activity_at" — so an activity update needs no
 * write here, it just changes what the eligibility query counts.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("merchant_onboarding_reminders", (table) => {
    addId(table);

    table
      .string("merchant_id", 34)
      .notNullable()
      .references("id")
      .inTable("merchants")
      .onDelete("CASCADE");

    table.string("tier", 10).notNullable(); // "24h" | "3d" | "30d"
    table.timestamp("sent_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    addTimestamps(knex, table);

    // The eligibility query's exact shape.
    table.index(["merchant_id", "tier", "sent_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("merchant_onboarding_reminders");
}

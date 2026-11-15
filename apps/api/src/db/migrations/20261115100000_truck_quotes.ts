import type { Knex } from "knex";
import { addMoneyColumn } from "../schema-helpers.js";

/**
 * Quotes, and per-km / per-tonne pricing for trucks (owner's call,
 * 2026-11-10 - PR T3 of `docs/plans/trucks-and-sales-agents.md`).
 *
 * Vehicles:
 * - `km_rate` / `tonne_rate` - the two new hiring units, trucks only. We
 *   can't measure distance, so a listing priced on either always goes
 *   through a quote; the rate is an honest guide, not a computed price.
 * - `minimum_charge` - "I don't move for less than KES X", shown beside
 *   the guide.
 * - `quote_required` - "Always quote me first" on a day/trip listing.
 *
 * Bookings: two statuses in front of the existing flow,
 * `quote_requested -> quoted -> confirmed`. `status` is a plain varchar
 * with no CHECK, so the statuses need no DDL. A quoted booking's money is
 * computed once from the quoted amount and never recomputed, the same
 * snapshot rule as every booking. The quote is valid until
 * `quote_expires_at` (48 h).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("vehicles", (table) => {
    addMoneyColumn(table, "km_rate", { nullable: true });
    addMoneyColumn(table, "tonne_rate", { nullable: true });
    addMoneyColumn(table, "minimum_charge", { nullable: true });
    table.boolean("quote_required").notNullable().defaultTo(false);
  });
  await knex.schema.alterTable("bookings", (table) => {
    table.timestamp("quoted_at", { useTz: true }).nullable();
    table.string("quote_note", 500).nullable();
    table.timestamp("quote_expires_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("bookings", (table) => {
    table.dropColumn("quoted_at");
    table.dropColumn("quote_note");
    table.dropColumn("quote_expires_at");
  });
  await knex.schema.alterTable("vehicles", (table) => {
    for (const c of ["km_rate", "tonne_rate", "minimum_charge"]) {
      table.dropColumn(`${c}_amount`);
      table.dropColumn(`${c}_currency`);
    }
    table.dropColumn("quote_required");
  });
}

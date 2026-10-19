import type { Knex } from "knex";

// Quiet hours removed from the product (owner's call, 2026-09-23).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("quiet_hours_enabled");
    table.dropColumn("quiet_from");
    table.dropColumn("quiet_until");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.boolean("quiet_hours_enabled").notNullable().defaultTo(false);
    table.string("quiet_from", 5).nullable();
    table.string("quiet_until", 5).nullable();
  });
}

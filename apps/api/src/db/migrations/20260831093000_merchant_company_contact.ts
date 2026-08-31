import type { Knex } from "knex";

/**
 * Company merchants now give a company email and a physical location
 * alongside the registration details (owner's call, 2026-08-31). Both are
 * required at submission when `owner_type = 'company'`; nullable at the
 * column level so a half-filled draft still saves.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.string("company_email", 320).nullable();
    table.string("company_address", 300).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("company_email");
    table.dropColumn("company_address");
  });
}

import type { Knex } from "knex";

/**
 * Reusable column patterns for every migration in this codebase. Decided
 * once in Phase 0 so later phases never have to re-derive them.
 */

/**
 * Primary key column for a prefixed-ULID id (e.g. "usr_01J8QM...").
 * The value itself is always generated app-side via `packages/types`'
 * `ID_PREFIXES` + the `ulid` package — never a DB default — so the prefix
 * stays a plain JS concern and the column is just an opaque text PK.
 */
export function addId(table: Knex.CreateTableBuilder, columnName = "id"): void {
  table.string(columnName, 34).primary();
}

/** created_at / updated_at, both UTC timestamptz, per spec §2. */
export function addTimestamps(knex: Knex, table: Knex.CreateTableBuilder): void {
  table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
}

/**
 * A money value as an integer-cents column plus its currency, per spec §2.
 * Produces `${name}_amount` (integer) and `${name}_currency` (char(3)).
 * Never use a numeric/float column for money anywhere in this schema.
 */
export function addMoneyColumn(
  table: Knex.CreateTableBuilder,
  name: string,
  options: { nullable?: boolean } = {},
): void {
  const amount = table.integer(`${name}_amount`);
  const currency = table.specificType(`${name}_currency`, "char(3)").defaultTo("KES");
  if (!options.nullable) {
    amount.notNullable();
    currency.notNullable();
  }
}

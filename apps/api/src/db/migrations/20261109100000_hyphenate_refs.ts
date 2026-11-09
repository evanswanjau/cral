import type { Knex } from "knex";

/**
 * Hyphen-separated plated references (owner's call, 2026-09-25):
 * `H260924001` -> `H-260924-001`, `CB260922001` -> `CB-260922-001`. Same
 * digits, same identity - only the reading changes, so the refs already
 * issued are rewritten to match rather than leaving two shapes in the
 * product. The generators (`nextListingRef`, `nextBookingRef`) write the
 * new shape from here on.
 *
 * Every column that stores a copy is rewritten: the refs themselves, the
 * payout-line snapshot, and `notifications.ref` (which also holds plates -
 * the patterns only match the dated ref shapes, so a plate is untouched).
 * Older `CRAL-V-*` / `CB-2841` refs don't match either pattern and are
 * left as they are. Notification body text is history and is not edited.
 */
const COLUMNS: Array<[table: string, column: string]> = [
  ["vehicles", "listing_ref"],
  ["bookings", "ref"],
  ["payout_run_lines", "booking_ref"],
  ["notifications", "ref"],
];

async function rewrite(knex: Knex, pattern: string, replacement: string): Promise<void> {
  for (const [table, column] of COLUMNS) {
    await knex.raw(`UPDATE ?? SET ?? = regexp_replace(??, ?, ?) WHERE ?? ~ ?`, [
      table,
      column,
      column,
      pattern,
      replacement,
      column,
      pattern,
    ]);
  }
}

export async function up(knex: Knex): Promise<void> {
  await rewrite(knex, "^H(\\d{6})(\\d{3})$", "H-\\1-\\2");
  await rewrite(knex, "^CB(\\d{6})(\\d{3})$", "CB-\\1-\\2");
}

export async function down(knex: Knex): Promise<void> {
  await rewrite(knex, "^H-(\\d{6})-(\\d{3})$", "H\\1\\2");
  await rewrite(knex, "^CB-(\\d{6})-(\\d{3})$", "CB\\1\\2");
}

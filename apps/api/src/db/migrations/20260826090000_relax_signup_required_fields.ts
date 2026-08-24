import type { Knex } from "knex";

/**
 * Sign-up is email + password only; full name and phone move to onboarding.
 *
 * This is a deliberate, recorded deviation from spec §4 ("phone number is
 * the identity in Kenya"). Both are still required before a merchant can
 * transact — the phone is collected and verified at payout setup, where it
 * is self-evidently necessary, rather than as an unexplained SMS wall in
 * front of a signup form. `GET /auth/registration-state` reports what is
 * still outstanding so the portals can nag for it.
 *
 * Postgres allows many NULLs under a UNIQUE index, so the phone/email
 * uniqueness guarantees are unaffected for rows that do have a value.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE users ALTER COLUMN phone DROP NOT NULL`);
  await knex.raw(`ALTER TABLE users ALTER COLUMN full_name DROP NOT NULL`);
}

export async function down(knex: Knex): Promise<void> {
  // Rows created email-first have no phone/name, so they must go before the
  // NOT NULL constraints can be restored.
  await knex("users").whereNull("phone").orWhereNull("full_name").del();
  await knex.raw(`ALTER TABLE users ALTER COLUMN phone SET NOT NULL`);
  await knex.raw(`ALTER TABLE users ALTER COLUMN full_name SET NOT NULL`);
}

import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Opt-in SMS two-factor authentication.
 *
 * This is the *only* SMS the product sends to an established account: a
 * merchant turns it on in settings, and from then on every password login
 * is followed by a texted six-digit code. Password reset deliberately does
 * not use SMS — it is always an emailed link (see the auth service).
 *
 * The enrolled number is kept separate from `users.phone` on purpose.
 * `users.phone` is the payout number collected during onboarding; a
 * merchant may want the challenge to land on a different handset, and
 * changing payout details should not silently move the second factor.
 *
 * A deviation from the frozen contract, which specified TOTP
 * (`secret` + `otpauth_uri`). Owner chose SMS 2026-08-24 — the phone is
 * already on file for payouts and an authenticator app is a bigger ask of
 * this audience. `openapi/identity.yaml` was rewritten to match.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.boolean("two_factor_enabled").notNullable().defaultTo(false);
    table.string("two_factor_phone", 20).nullable();
    table.timestamp("two_factor_enrolled_at", { useTz: true }).nullable();
  });

  // One row per login that got as far as a correct password but still owes
  // a code. Holds its own code hash rather than borrowing `otp_codes`,
  // because a challenge is addressed by id, not by identifier.
  await knex.schema.createTable("two_factor_challenges", (table) => {
    addId(table);

    table.string("user_id", 34).notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("device_id", 128).notNullable(); // carried through to the session it will create
    table.string("code_hash", 64).notNullable(); // sha256 of the 6-digit code
    table.integer("attempts").notNullable().defaultTo(0);
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("consumed_at", { useTz: true }).nullable();

    addTimestamps(knex, table);

    table.index(["user_id"]);
    table.index(["expires_at"]);
  });

  // Ten single-use codes, issued once when enrolment is confirmed. The way
  // back in when the handset is lost or the SIM is swapped.
  await knex.schema.createTable("recovery_codes", (table) => {
    addId(table);

    table.string("user_id", 34).notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("code_hash", 64).notNullable();
    table.timestamp("consumed_at", { useTz: true }).nullable();

    addTimestamps(knex, table);

    table.index(["user_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("recovery_codes");
  await knex.schema.dropTableIfExists("two_factor_challenges");
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("two_factor_enabled");
    table.dropColumn("two_factor_phone");
    table.dropColumn("two_factor_enrolled_at");
  });
}

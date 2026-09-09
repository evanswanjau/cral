import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Admin (Ops) console identity — spec §8's separate `aud: "ops"` audience.
 *
 * Deliberately its own tables, not rows in `users` / `sessions`:
 *
 *  - §8 gives the console a separate cookie domain, mandatory 2FA on every
 *    login, a 10-minute access token, an 8-hour absolute session cap and a
 *    20-minute idle timeout — none of which the public auth path has. A
 *    separate store means `authenticate()` never has to branch on audience,
 *    and a compromise of the public login flow can't touch Ops.
 *  - The role set is its own closed enum (`admin_reviewer` / `admin_finance`
 *    / `admin_support` / `admin_super`), unrelated to `users.roles`'s flat
 *    `merchant`/`customer` text[].
 *
 * `admin_sessions` carries an absolute `expires_at` set once at creation
 * (now + 8h) and a `last_seen_at` bumped on every authenticated request —
 * the 20-minute idle window is `now - last_seen_at`, enforced at refresh.
 *
 * The second factor is SMS, reusing the TextSMS adapter — consistent with
 * the 2026-08-24 "SMS is only ever a 2FA challenge" decision. `phone` is
 * therefore required on an admin account. `admin_login_challenges` is the
 * short-lived row between a correct password and a usable session; it is
 * addressed by an opaque `challenge_token` (only its hash is stored), never
 * by row id.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("admin_users", (table) => {
    addId(table);

    // Stored lowercased by the service, like `users.email`. Plain unique
    // index rather than citext — the write path already normalises.
    table.string("email", 320).notNullable().unique();
    table.string("password_hash", 255).notNullable();
    // Required: the mandatory second factor is texted here.
    table.string("phone", 20).notNullable();
    table.string("full_name", 200).notNullable();

    table
      .string("role", 20)
      .notNullable()
      .checkIn(
        ["admin_reviewer", "admin_finance", "admin_support", "admin_super"],
        "admin_users_role_check",
      );

    // Queue slugs a non-super admin is allowed to work — "vehicles",
    // "merchants", "disputes", "invoices", "payouts", "comms". `admin_super`
    // ignores this and sees everything.
    table.specificType("assigned_queues", "text[]").notNullable().defaultTo("{}");

    // "active" | "disabled" — nothing disables an admin yet (team
    // management is a later slice), same footing as `merchants.approved_at`.
    table.string("status", 20).notNullable().defaultTo("active");
    table.timestamp("last_login_at", { useTz: true }).nullable();

    addTimestamps(knex, table);
  });

  await knex.schema.createTable("admin_sessions", (table) => {
    addId(table);

    table
      .string("admin_user_id", 34)
      .notNullable()
      .references("id")
      .inTable("admin_users")
      .onDelete("CASCADE");

    table.string("device_id", 128).notNullable();
    table.string("user_agent", 400).nullable();
    table.string("ip", 45).nullable();

    table.string("token_hash", 64).notNullable().unique(); // sha256 of the current refresh token
    table.string("previous_token_hash", 64).nullable();

    // Absolute cap: set once at creation to now + 8h and never extended.
    table.timestamp("expires_at", { useTz: true }).notNullable();
    // Bumped on every authenticated request; the 20-minute idle timeout is
    // measured against this at refresh time.
    table.timestamp("last_seen_at", { useTz: true }).notNullable();
    table.timestamp("revoked_at", { useTz: true }).nullable();
    table.string("revoked_reason", 40).nullable();
    // "logout" | "reuse_detected" | "idle_timeout" | "absolute_cap" | "revoked"

    addTimestamps(knex, table);

    table.index(["admin_user_id"]);
    table.index(["expires_at"]);
  });

  await knex.schema.createTable("admin_login_challenges", (table) => {
    addId(table);

    table
      .string("admin_user_id", 34)
      .notNullable()
      .references("id")
      .inTable("admin_users")
      .onDelete("CASCADE");

    table.string("token_hash", 64).notNullable().unique(); // sha256 of the opaque challenge_token
    table.string("code_hash", 64).notNullable(); // sha256 of the 6-digit SMS code
    table.string("device_id", 128).notNullable(); // carried through to the session it creates
    table.integer("attempts").notNullable().defaultTo(0);
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("consumed_at", { useTz: true }).nullable();

    addTimestamps(knex, table);

    table.index(["admin_user_id"]);
    table.index(["expires_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("admin_login_challenges");
  await knex.schema.dropTableIfExists("admin_sessions");
  await knex.schema.dropTableIfExists("admin_users");
}

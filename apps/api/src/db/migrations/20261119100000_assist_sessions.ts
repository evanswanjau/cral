import type { Knex } from "knex";
import { addId, addTimestamps } from "../schema-helpers.js";

/**
 * Assist sessions (Phase 3, PR AG3 of `docs/plans/verticals-roadmap.md`;
 * Part B3 of `docs/plans/trucks-and-sales-agents.md`). A sales agent fills
 * in onboarding for the owner, with the owner's SMS code as consent. See
 * `openapi/admin-agents.yaml` and `openapi/merchant-onboarding.yaml`.
 *
 *  - `sessions.kind` (`user` / `assist`) and `sessions.assisted_by`: an
 *    assist token is a public-audience access token backed by a real
 *    session row, so revoking it works like any other session.
 *    `authenticate()` reads `kind` from the row, never from the token
 *    alone, to apply the onboarding-only allowlist. A CHECK keeps the two
 *    columns in step.
 *  - `assist_challenges`: the consent code, hashed (sha256, as
 *    `otp_codes`), bound to one agent and one merchant, single-use.
 *  - `documents.uploaded_by_admin_id`: which agent uploaded a file during
 *    an assist, so the reviewer can see it and the agent can read back
 *    only what they uploaded.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("sessions", (table) => {
    table.string("kind", 10).notNullable().defaultTo("user");
    table
      .string("assisted_by", 34)
      .nullable()
      .references("id")
      .inTable("admin_users")
      .onDelete("CASCADE");
    table.index(["user_id", "kind"]);
  });
  await knex.raw(
    `ALTER TABLE sessions ADD CONSTRAINT sessions_kind_check
       CHECK ((kind = 'user' AND assisted_by IS NULL) OR (kind = 'assist' AND assisted_by IS NOT NULL))`,
  );

  await knex.schema.createTable("assist_challenges", (table) => {
    addId(table);
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");
    table.string("admin_user_id", 34).notNullable().references("id").inTable("admin_users").onDelete("CASCADE");
    table.string("code_hash", 64).notNullable();
    table.integer("attempts").notNullable().defaultTo(0);
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("consumed_at", { useTz: true }).nullable();
    addTimestamps(knex, table);
    table.index(["merchant_id", "admin_user_id"]);
  });

  await knex.schema.alterTable("documents", (table) => {
    table
      .string("uploaded_by_admin_id", 34)
      .nullable()
      .references("id")
      .inTable("admin_users")
      .onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("documents", (table) => {
    table.dropColumn("uploaded_by_admin_id");
  });
  await knex.schema.dropTableIfExists("assist_challenges");
  // An assist session can't outlive the columns that mark it as one.
  await knex("sessions").where({ kind: "assist" }).delete();
  await knex.raw("ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_kind_check");
  await knex.schema.alterTable("sessions", (table) => {
    table.dropIndex(["user_id", "kind"]);
    table.dropColumn("assisted_by");
    table.dropColumn("kind");
  });
}

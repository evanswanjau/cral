import type { Knex } from "knex";

/**
 * Sales agents (Phase 3, PR AG1 of `docs/plans/verticals-roadmap.md`; Part
 * B of `docs/plans/trucks-and-sales-agents.md`). See `openapi/admin-agents.yaml`.
 *
 *  - `admin_users.role` gains `admin_sales` ("Sales agent"). An agent adds
 *    merchants and tracks them; it can never approve anything.
 *  - `merchants.onboarded_by` -> `admin_users` (the agent who brought the
 *    merchant in, `SET NULL` if that admin row ever goes) and
 *    `merchants.onboarding_source` (`self` / `agent_invite` / `agent_link`).
 *    Every existing merchant signed themselves up, so the default `self`
 *    is also the backfill. `agent_link` is PR AG2's personal sign-up link.
 *  - `users.invited_at` / `users.invite_accepted_at`: an agent-created
 *    account has an unusable password until the owner sets one from the
 *    emailed link. "Invite pending" is `invited_at` set and
 *    `invite_accepted_at` null - what "My merchants" reads as "Invited" and
 *    what keeps "Resend invite" on offer.
 *  - `password_reset_tokens.purpose` (`reset` / `invite`): the invite reuses
 *    the reset-link mechanism (one table, one lookup, one screen) but lives
 *    7 days, not 30 minutes, and says "set" rather than "reset".
 */
const ROLES_BEFORE = ["admin_reviewer", "admin_finance", "admin_support", "admin_super"];
const ROLES_AFTER = ["admin_reviewer", "admin_finance", "admin_support", "admin_sales", "admin_super"];

const inList = (values: string[]) => values.map((v) => `'${v}'`).join(", ");

export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check");
  await knex.raw(
    `ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check CHECK (role IN (${inList(ROLES_AFTER)}))`,
  );

  await knex.schema.alterTable("merchants", (table) => {
    table
      .string("onboarded_by", 34)
      .nullable()
      .references("id")
      .inTable("admin_users")
      .onDelete("SET NULL");
    table.string("onboarding_source", 20).notNullable().defaultTo("self");
    table.index(["onboarded_by", "created_at"]);
  });
  await knex.raw(
    `ALTER TABLE merchants ADD CONSTRAINT merchants_onboarding_source_check
       CHECK (onboarding_source IN ('self', 'agent_invite', 'agent_link'))`,
  );

  await knex.schema.alterTable("users", (table) => {
    table.timestamp("invited_at", { useTz: true }).nullable();
    table.timestamp("invite_accepted_at", { useTz: true }).nullable();
  });

  await knex.schema.alterTable("password_reset_tokens", (table) => {
    table.string("purpose", 10).notNullable().defaultTo("reset");
  });
  await knex.raw(
    `ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_purpose_check
       CHECK (purpose IN ('reset', 'invite'))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    "ALTER TABLE password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_purpose_check",
  );
  await knex.schema.alterTable("password_reset_tokens", (table) => {
    table.dropColumn("purpose");
  });

  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("invited_at");
    table.dropColumn("invite_accepted_at");
  });

  await knex.raw("ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_onboarding_source_check");
  await knex.schema.alterTable("merchants", (table) => {
    table.dropIndex(["onboarded_by", "created_at"]);
    table.dropColumn("onboarded_by");
    table.dropColumn("onboarding_source");
  });

  // An agent can't keep a role the old CHECK doesn't know. Disable rather
  // than delete: admin rows are referenced by audit history.
  await knex("admin_users")
    .where({ role: "admin_sales" })
    .update({ role: "admin_support", status: "disabled" });
  await knex.raw("ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check");
  await knex.raw(
    `ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check CHECK (role IN (${inList(ROLES_BEFORE)}))`,
  );
}

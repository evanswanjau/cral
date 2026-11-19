import type { Knex } from "knex";

/**
 * Sales agents' personal sign-up links (Phase 3, PR AG2 of
 * `docs/plans/verticals-roadmap.md`; Part B2 of
 * `docs/plans/trucks-and-sales-agents.md`). See `openapi/admin-agents.yaml`.
 *
 * `admin_users.signup_code`: the short code in `/join?a=<code>`. Issued the
 * first time an agent opens My merchants (`GET /admin/agents/link`), never
 * changed after that. Stored upper-case; unique, so one code names one
 * agent. Merchants credited through it get `onboarded_by` and
 * `onboarding_source = 'agent_link'`, both added by AG1's migration.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("admin_users", (table) => {
    table.string("signup_code", 12).nullable().unique();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("admin_users", (table) => {
    table.dropUnique(["signup_code"]);
    table.dropColumn("signup_code");
  });
}

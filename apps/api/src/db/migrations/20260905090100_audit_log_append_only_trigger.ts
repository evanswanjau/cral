import type { Knex } from "knex";

/**
 * Actually makes `audit_log` append-only.
 *
 * The create migration ran `REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC`
 * and CLAUDE.md has claimed ever since that the table is append-only at the
 * database level. It wasn't: the API connects as the role that *owns* the
 * table, and owner privileges bypass a REVOKE from PUBLIC entirely. A
 * `DELETE FROM audit_log` from the app's own connection succeeded.
 *
 * A trigger is the fix that holds regardless of role, because it runs for
 * the owner too. (Running the app as a non-owner role would be stronger
 * still, but that is an operational change — a second database role,
 * provisioned per environment — rather than a migration, and this closes
 * the hole today.)
 *
 * Note this constrains the *application*. A superuser can still disable the
 * trigger; the guarantee is "no code path in this service can rewrite
 * history", which is what spec §23/§27 actually needs.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'restrict_violation';
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER audit_log_no_update_or_delete
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TRIGGER IF EXISTS audit_log_no_update_or_delete ON audit_log;`);
  await knex.raw(`DROP FUNCTION IF EXISTS audit_log_is_append_only();`);
}

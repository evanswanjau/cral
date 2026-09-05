import type { Knex } from "knex";

/**
 * Scopes idempotency keys to the caller.
 *
 * The original table keyed on `(key, route)` alone, so the namespace was
 * global across every merchant. Two callers who happened to generate the
 * same Idempotency-Key on the same route — a counter, a weak client-side
 * UUID, a copied cURL — collided, and the second was served the first's
 * stored response body verbatim. On `POST /merchant/payouts/{id}/queries`
 * or `/bookings/{id}/reports` that is one merchant reading another's
 * response; on any state-changing POST it silently swallows the second
 * caller's action.
 *
 * `user_id` is nullable because the middleware can in principle guard an
 * unauthenticated route (none does today). Postgres treats NULLs as
 * distinct in a unique index, which would defeat the whole point for those
 * rows, so the primary key uses a sentinel instead — see the middleware.
 */
export async function up(knex: Knex): Promise<void> {
  // Existing rows are dev/test replay records with no owner recorded. There
  // is no way to attribute them after the fact and nothing replays a key
  // across a deploy, so clear the table rather than invent an owner.
  await knex("idempotency_keys").delete();

  await knex.schema.alterTable("idempotency_keys", (table) => {
    table.dropPrimary();
  });

  await knex.schema.alterTable("idempotency_keys", (table) => {
    // The sentinel "anonymous" stands in for an unauthenticated caller so
    // the column can stay NOT NULL and participate in the primary key.
    table.string("user_id", 34).notNullable().defaultTo("anonymous");
    table.primary(["user_id", "key", "route"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex("idempotency_keys").delete();

  await knex.schema.alterTable("idempotency_keys", (table) => {
    table.dropPrimary();
    table.dropColumn("user_id");
  });

  await knex.schema.alterTable("idempotency_keys", (table) => {
    table.primary(["key", "route"]);
  });
}

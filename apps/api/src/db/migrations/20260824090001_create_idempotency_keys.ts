import type { Knex } from "knex";

/**
 * Backs the Idempotency-Key middleware (spec §2): every POST that moves
 * money or completes a handover must replay its original response, not
 * repeat the side effect, for replays within 24h of the same key.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("idempotency_keys", (table) => {
    table.string("key", 100).notNullable();
    table.string("route", 200).notNullable();
    table.string("request_hash", 64).notNullable(); // sha256 of the body, to detect key reuse with a different body
    table.integer("response_status").nullable(); // null while the original request is still in flight
    table.jsonb("response_body").nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at", { useTz: true }).notNullable();

    table.primary(["key", "route"]);
    table.index(["expires_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("idempotency_keys");
}

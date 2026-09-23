import type { Knex } from "knex";
import { addId, addMoneyColumn, addTimestamps } from "../schema-helpers.js";

/**
 * "Services" (owner's call, 2026-09-23) — the first offering under it is
 * towing/recovery. This is CRAL-run dispatch, not a vehicle-hire booking
 * (no merchant, no vehicle, no `computeBookingPricing`), so it is its own
 * table rather than a `bookings` row with a fake vehicle attached.
 *
 * v1 is deliberately lead-capture, not transactional: "charged per km or
 * subject to discussion" means there is no fixed price at request time, so
 * `quoted_amount` is nullable (null = "subject to discussion") and nothing
 * here touches the payment rail. An admin quotes it by hand; the customer
 * accepts or the request lapses. No plated ref, no events table, no
 * merchant involvement — same "don't build ahead of what's real" discipline
 * as the fabricated `id_verified` badge this codebase has already reversed
 * once.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("service_requests", (table) => {
    addId(table);

    table.string("user_id", 34).notNullable().references("id").inTable("users").onDelete("CASCADE");

    // mechanical_breakdown | accident
    table.string("reason", 20).notNullable();

    table.string("pickup_location", 300).notNullable();
    table.string("destination_location", 300).nullable();
    // Typed at request time, not read off `users.phone` - the requester may
    // be stranded with a different phone in hand than the one on file.
    table.string("contact_phone", 20).notNullable();
    table.text("description").nullable();

    table.decimal("distance_km", 6, 2).nullable();
    // Null means "subject to discussion" - the request was quoted without a
    // fixed figure, not that quoting hasn't happened yet (status carries
    // that distinction).
    addMoneyColumn(table, "quoted", { nullable: true });
    table.text("quote_note").nullable();
    table.string("quoted_by", 34).nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    table.timestamp("quoted_at", { useTz: true }).nullable();

    // requested | quoted | accepted | declined | completed | cancelled
    table.string("status", 20).notNullable().defaultTo("requested");
    table.text("decline_reason").nullable();
    table.text("cancel_reason").nullable();
    table.string("decided_by", 34).nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    table.timestamp("decided_at", { useTz: true }).nullable();

    addTimestamps(knex, table);

    table.index(["user_id"]);
    table.index(["status", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("service_requests");
}

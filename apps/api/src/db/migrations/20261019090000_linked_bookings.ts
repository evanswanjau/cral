import type { Knex } from "knex";

/**
 * A self-drive car with another owner's driver (owner's call, 2026-10-19 -
 * docs/plans/drivers.md). The car's owner's own drivers come first; only
 * when they have none can the renter add any checked driver. That driver
 * belongs to a different merchant, so the request becomes two bookings -
 * the car with its owner, the driver with theirs - each accepted, paid and
 * paid out on its own. `linked_booking_id` points each at the other so
 * both sides (and the renter) see they were booked together.
 *
 * Two bookings rather than one with two payees keeps the rule that a
 * booking pays out exactly once, to one merchant
 * (`payout_run_lines.booking_id` unique) - nothing in payouts changes.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("bookings", (table) => {
    table.string("linked_booking_id", 34).nullable().references("id").inTable("bookings").onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("bookings", (table) => {
    table.dropColumn("linked_booking_id");
  });
}

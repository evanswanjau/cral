import type { Knex } from "knex";

/**
 * Delivery to the renter (owner's call, 2026-10-17). A renter can ask for
 * the car to be brought to an address or to an airport instead of
 * collecting it from the owner.
 *
 * - `vehicles.offers_delivery` - the owner opts in per car; off by default,
 *   so no existing listing starts offering something its owner never agreed
 *   to.
 * - `bookings.handover_option` - `collect` (the default, and every booking
 *   made before this), `address`, `jkia` or `wilson`.
 * - `bookings.delivery_address` - only for `address`; the airports are
 *   fixed places.
 * - `bookings.delivery_fee` - a snapshot of the CRAL-set fee at request
 *   time, the same way `gross` is never recomputed. It is already inside
 *   `gross`; this pair exists so a screen can show the split.
 *
 * Additive with defaults, so a code revert alone is safe.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("vehicles", (table) => {
    table.boolean("offers_delivery").notNullable().defaultTo(false);
  });

  await knex.schema.alterTable("bookings", (table) => {
    table.string("handover_option", 10).notNullable().defaultTo("collect");
    table.text("delivery_address").nullable();
    table.integer("delivery_fee_amount").notNullable().defaultTo(0);
    table.specificType("delivery_fee_currency", "char(3)").notNullable().defaultTo("KES");
  });
  await knex.raw(
    "ALTER TABLE bookings ADD CONSTRAINT bookings_handover_option_check CHECK (handover_option IN ('collect', 'address', 'jkia', 'wilson'))",
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_handover_option_check");
  await knex.schema.alterTable("bookings", (table) => {
    table.dropColumn("handover_option");
    table.dropColumn("delivery_address");
    table.dropColumn("delivery_fee_amount");
    table.dropColumn("delivery_fee_currency");
  });
  await knex.schema.alterTable("vehicles", (table) => {
    table.dropColumn("offers_delivery");
  });
}

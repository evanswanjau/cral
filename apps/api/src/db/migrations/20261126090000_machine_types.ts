import type { Knex } from "knex";

/**
 * Machine types and plate-less machines (owner's decision 4, 2026-11-26 -
 * PR H1 of `docs/plans/hire-that-works.md`).
 *
 * `machine_type` is only meaningful when `vehicles.type = 'machinery'`;
 * null for every other category (written that way by
 * `categories.ts#machineColumns`). Nullable here and enforced at
 * submission, like `truck_type`, so a draft can be saved half-filled. The
 * CHECK repeats `categories.ts#MACHINE_TYPES` so a bad slug can't reach
 * the catalog filter from a script or a seed - keep the two in step.
 *
 * `registration_kind` says what `registration` holds: a number plate, or
 * for a machine that has none, its serial number. Reusing `registration`
 * keeps the global uniqueness index, the bookings join and every screen
 * that prints it working; the CHECK keeps `serial` to machinery.
 */
const MACHINE_TYPES = [
  "excavator",
  "backhoe_loader",
  "wheel_loader",
  "skid_steer",
  "bulldozer",
  "grader",
  "roller",
  "forklift",
  "telehandler",
  "mobile_crane",
  "concrete_mixer",
  "other",
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("vehicles", (table) => {
    table.string("machine_type", 20).nullable();
    table.string("registration_kind", 10).notNullable().defaultTo("plate");
  });
  await knex.raw(
    `ALTER TABLE vehicles ADD CONSTRAINT vehicles_machine_type_check
       CHECK (machine_type IS NULL OR (type = 'machinery' AND machine_type IN (${MACHINE_TYPES.map((t) => `'${t}'`).join(", ")})))`,
  );
  await knex.raw(
    `ALTER TABLE vehicles ADD CONSTRAINT vehicles_registration_kind_check
       CHECK (registration_kind = 'plate' OR (registration_kind = 'serial' AND type = 'machinery'))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_registration_kind_check");
  await knex.raw("ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_machine_type_check");
  await knex.schema.alterTable("vehicles", (table) => {
    table.dropColumn("machine_type");
    table.dropColumn("registration_kind");
  });
}

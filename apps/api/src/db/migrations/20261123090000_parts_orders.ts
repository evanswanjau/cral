import type { Knex } from "knex";

/**
 * Spare parts (Phase 5, PR PT1 of `docs/plans/verticals-roadmap.md`;
 * decisions in `docs/decisions/parts.md`; contracts
 * `openapi/customer-garage.yaml`, `openapi/merchant-garage.yaml`,
 * `openapi/admin-garage-orders.yaml`, `openapi/merchant-outlets.yaml`).
 *
 * Parts reuse the garage engine (requests, quotes, orders, settlement,
 * payouts). Only the differences are stored here:
 *
 *  - `quote_requests` of `kind = 'part'` carry the part asked for
 *    (`part_name`) and where to deliver it (`delivery_address`), and have no
 *    `service_type` (it becomes nullable; a CHECK keeps each kind's own
 *    fields filled).
 *  - `quotes` gain `part_condition` (`genuine` | `oem` | `used`) and
 *    `fulfilment` (`fitted` | `delivered`), both set or both empty: a parts
 *    dealer's quote names them, a garage's quote does not.
 *  - `platform_settings.commission.parts`: CRAL's rate on parts, its own
 *    admin-only setting (owner decision 10), seeded at the hire rate. Never
 *    sent to a merchant.
 *
 * The outlets CHECK has allowed `parts` since GS1; nothing changes there.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("quote_requests", (table) => {
    table.string("part_name", 120).nullable();
    table.text("delivery_address").nullable();
  });
  await knex.raw(`ALTER TABLE quote_requests ALTER COLUMN service_type DROP NOT NULL`);
  await knex.raw(`
    ALTER TABLE quote_requests ADD CONSTRAINT quote_requests_kind_fields CHECK (
      (kind = 'service' AND service_type IS NOT NULL AND part_name IS NULL)
      OR (kind = 'part' AND service_type IS NULL AND part_name IS NOT NULL AND delivery_address IS NOT NULL)
    )
  `);

  await knex.schema.alterTable("quotes", (table) => {
    table.string("part_condition", 10).nullable();
    table.string("fulfilment", 10).nullable();
  });
  await knex.raw(
    `ALTER TABLE quotes ADD CONSTRAINT quotes_part_condition_check CHECK (part_condition IS NULL OR part_condition IN ('genuine', 'oem', 'used'))`,
  );
  await knex.raw(
    `ALTER TABLE quotes ADD CONSTRAINT quotes_fulfilment_check CHECK (fulfilment IS NULL OR fulfilment IN ('fitted', 'delivered'))`,
  );
  await knex.raw(
    `ALTER TABLE quotes ADD CONSTRAINT quotes_part_fields_together CHECK ((part_condition IS NULL) = (fulfilment IS NULL))`,
  );

  const hire = await knex("platform_settings").where({ key: "commission.garage" }).first("value");
  await knex("platform_settings")
    .insert({ key: "commission.parts", value: hire?.value !== undefined ? JSON.stringify(hire.value) : JSON.stringify(0.1) })
    .onConflict("key")
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex("platform_settings").where({ key: "commission.parts" }).delete();
  await knex.raw(`ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_part_fields_together`);
  await knex.raw(`ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_fulfilment_check`);
  await knex.raw(`ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_part_condition_check`);
  await knex.schema.alterTable("quotes", (table) => {
    table.dropColumn("fulfilment");
    table.dropColumn("part_condition");
  });
  await knex.raw(`ALTER TABLE quote_requests DROP CONSTRAINT IF EXISTS quote_requests_kind_fields`);
  await knex("quote_requests").where({ kind: "part" }).delete();
  await knex.raw(`ALTER TABLE quote_requests ALTER COLUMN service_type SET NOT NULL`);
  await knex.schema.alterTable("quote_requests", (table) => {
    table.dropColumn("delivery_address");
    table.dropColumn("part_name");
  });
}

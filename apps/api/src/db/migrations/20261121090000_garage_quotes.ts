import type { Knex } from "knex";
import { addId, addMoneyColumn, addTimestamps } from "../schema-helpers.js";

/**
 * Garage quotes (Phase 4, PR GS2 of `docs/plans/verticals-roadmap.md`;
 * decisions in `docs/decisions/garage.md`; contracts
 * `openapi/customer-garage.yaml` and `openapi/merchant-garage.yaml`).
 *
 *  - `customer_cars` (`car_`): "My cars". The plate is normalised but
 *    unique per user only: a car changes hands, and two people may drive
 *    it. The chassis number is shown to an outlet that is asked to quote,
 *    never publicly.
 *  - `quote_requests` (`rfq_`): what the car needs, in which county, for
 *    which service type. `kind` is `service` now; `part` arrives with PT1.
 *    `open -> cancelled` here; GS3 adds `accepted` when a quote is paid.
 *  - `quote_request_outlets`: which outlets were asked (at most 5, one per
 *    merchant, so every quote has one payee). `declined_at` is an outlet
 *    saying it can't do the job.
 *  - `quotes` (`quo_`) and `quote_lines` (`qln_`): one quote per outlet per
 *    request, revisable while the request is open. Valid 48 h from the last
 *    send (`valid_until`), the truck-quote window. The total is stored next
 *    to the lines and always written from them in the same transaction.
 *  - `platform_settings.commission.garage`: CRAL's rate on garage work, its
 *    own admin-only setting (owner decision 2026-11-19), seeded at the hire
 *    rate. Never sent to a merchant; only shilling take-home amounts are.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("customer_cars", (table) => {
    addId(table);
    table.string("user_id", 34).notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("make", 60).notNullable();
    table.string("model", 60).notNullable();
    table.integer("year").notNullable();
    table.string("plate", 20).notNullable();
    table.string("chassis_number", 30).nullable();
    addTimestamps(knex, table);
    table.index(["user_id", "created_at"]);
  });
  await knex.raw(`
    CREATE UNIQUE INDEX customer_cars_user_plate_unique
    ON customer_cars (user_id, upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g')))
  `);

  await knex.schema.createTable("quote_requests", (table) => {
    addId(table);
    table.string("user_id", 34).notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.string("car_id", 34).notNullable().references("id").inTable("customer_cars").onDelete("RESTRICT");
    table.string("kind", 10).notNullable().defaultTo("service");
    table.string("service_type", 20).notNullable();
    table.text("description").notNullable();
    table.string("county", 60).notNullable();
    table.string("status", 20).notNullable().defaultTo("open");
    table.timestamp("cancelled_at", { useTz: true }).nullable();
    addTimestamps(knex, table);
    table.index(["user_id", "created_at"]);
  });
  await knex.raw(`ALTER TABLE quote_requests ADD CONSTRAINT quote_requests_kind_check CHECK (kind IN ('service', 'part'))`);
  await knex.raw(
    `ALTER TABLE quote_requests ADD CONSTRAINT quote_requests_status_check CHECK (status IN ('open', 'cancelled', 'accepted'))`,
  );

  await knex.schema.createTable("quote_request_outlets", (table) => {
    table.string("request_id", 34).notNullable().references("id").inTable("quote_requests").onDelete("CASCADE");
    table.string("outlet_id", 34).notNullable().references("id").inTable("outlets").onDelete("CASCADE");
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");
    table.timestamp("declined_at", { useTz: true }).nullable();
    addTimestamps(knex, table);
    table.primary(["request_id", "outlet_id"]);
    table.unique(["request_id", "merchant_id"]);
    table.index(["merchant_id", "created_at"]);
  });

  await knex.schema.createTable("quotes", (table) => {
    addId(table);
    table.string("request_id", 34).notNullable().references("id").inTable("quote_requests").onDelete("CASCADE");
    table.string("outlet_id", 34).notNullable().references("id").inTable("outlets").onDelete("CASCADE");
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("CASCADE");
    // sent | withdrawn (GS3 adds accepted / superseded)
    table.string("status", 20).notNullable().defaultTo("sent");
    table.integer("days_needed").notNullable();
    table.text("note").nullable();
    addMoneyColumn(table, "total");
    table.timestamp("sent_at", { useTz: true }).notNullable();
    table.timestamp("valid_until", { useTz: true }).notNullable();
    addTimestamps(knex, table);
    table.unique(["request_id", "outlet_id"]);
  });
  await knex.raw(
    `ALTER TABLE quotes ADD CONSTRAINT quotes_status_check CHECK (status IN ('sent', 'withdrawn', 'accepted', 'superseded'))`,
  );

  await knex.schema.createTable("quote_lines", (table) => {
    addId(table);
    table.string("quote_id", 34).notNullable().references("id").inTable("quotes").onDelete("CASCADE");
    table.integer("position").notNullable();
    table.string("kind", 10).notNullable();
    table.string("description", 200).notNullable();
    addMoneyColumn(table, "amount");
    addTimestamps(knex, table);
    table.index(["quote_id", "position"]);
  });
  await knex.raw(
    `ALTER TABLE quote_lines ADD CONSTRAINT quote_lines_kind_check CHECK (kind IN ('part', 'labour', 'delivery', 'other'))`,
  );
  await knex.raw(`ALTER TABLE quote_lines ADD CONSTRAINT quote_lines_amount_check CHECK (amount_amount > 0)`);

  await knex("platform_settings").insert({ key: "commission.garage", value: JSON.stringify(0.1) });
}

export async function down(knex: Knex): Promise<void> {
  await knex("platform_settings").where({ key: "commission.garage" }).delete();
  await knex.schema.dropTableIfExists("quote_lines");
  await knex.schema.dropTableIfExists("quotes");
  await knex.schema.dropTableIfExists("quote_request_outlets");
  await knex.schema.dropTableIfExists("quote_requests");
  await knex.schema.dropTableIfExists("customer_cars");
}

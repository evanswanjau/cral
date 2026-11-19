import type { Knex } from "knex";
import { addId, addMoneyColumn, addTimestamps } from "../schema-helpers.js";

/**
 * Garage orders (Phase 4, PR GS3 of `docs/plans/verticals-roadmap.md`;
 * decisions in `docs/decisions/garage.md`; contracts
 * `openapi/customer-garage.yaml`, `openapi/merchant-garage.yaml`,
 * `openapi/admin-garage-orders.yaml`).
 *
 *  - `orders` (`ord_`, ref `G-YYMMDD-NNN`): accepting a quote creates one.
 *    One payee (the quote's merchant), the same rule as bookings.
 *    `awaiting_payment -> paid -> in_progress -> ready -> completed`, with
 *    `cancelled` (unpaid only), `problem` (customer, before confirming) and
 *    `refunded` (Ops). The money columns are the sum of the quotes the
 *    customer has paid on this order, each a snapshot taken when that quote
 *    was accepted; nothing recomputes them from a rate.
 *  - `quotes` gain `kind` (`original` | `extra`), `order_id`, the snapshot
 *    (`commission_amount`, `merchant_net_amount`, `accepted_at`) and
 *    `paid_at`. An extra-work quote is a second quote on the same order:
 *    same request and outlet, so the old one-per-outlet unique becomes a
 *    partial unique on originals only.
 *  - `payment_requests` gain `order_id` + `quote_id` (which quote a prompt
 *    pays); `booking_id` becomes nullable, with a CHECK that exactly one of
 *    the two is set. `applySettlement` stays the one copy of the settle
 *    rules for both.
 *  - `payout_run_lines` gain `order_id`, unique like `booking_id`, so an
 *    order pays out exactly once. A line names at most one of the two
 *    (`booking_id` stays nullable for the archival note on the original
 *    migration, so this is "not both", not "exactly one").
 *  - `refunds` gain `order_id`; `booking_id` becomes nullable. An order can
 *    have two payments (original + extra), so its refunds are unique per
 *    payment and reason rather than per order and reason.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("order_ref_daily_counters", (table) => {
    table.date("day").primary();
    table.integer("n").notNullable().defaultTo(0);
    addTimestamps(knex, table);
  });

  await knex.schema.createTable("orders", (table) => {
    addId(table);
    table.string("ref", 20).notNullable().unique();
    table.string("kind", 10).notNullable().defaultTo("service");
    table.string("request_id", 34).notNullable().unique().references("id").inTable("quote_requests").onDelete("RESTRICT");
    table.string("quote_id", 34).notNullable().unique().references("id").inTable("quotes").onDelete("RESTRICT");
    table.string("outlet_id", 34).notNullable().references("id").inTable("outlets").onDelete("RESTRICT");
    table.string("merchant_id", 34).notNullable().references("id").inTable("merchants").onDelete("RESTRICT");
    table.string("user_id", 34).notNullable().references("id").inTable("users").onDelete("RESTRICT");
    table.string("car_id", 34).notNullable().references("id").inTable("customer_cars").onDelete("RESTRICT");
    table.string("status", 20).notNullable().defaultTo("awaiting_payment");
    addMoneyColumn(table, "gross");
    addMoneyColumn(table, "commission");
    addMoneyColumn(table, "merchant_net");
    table.timestamp("paid_at", { useTz: true }).nullable();
    table.timestamp("started_at", { useTz: true }).nullable();
    table.timestamp("ready_at", { useTz: true }).nullable();
    table.timestamp("completed_at", { useTz: true }).nullable();
    // customer | auto | ops
    table.string("confirmed_by", 10).nullable();
    table.timestamp("cancelled_at", { useTz: true }).nullable();
    table.timestamp("problem_raised_at", { useTz: true }).nullable();
    table.text("problem_note").nullable();
    table.timestamp("resolved_at", { useTz: true }).nullable();
    table.text("resolution_note").nullable();
    table.string("resolved_by", 34).nullable();
    addTimestamps(knex, table);
    table.index(["user_id", "created_at"]);
    table.index(["merchant_id", "created_at"]);
    table.index(["status", "ready_at"]);
  });
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT orders_kind_check CHECK (kind IN ('service', 'part'))`);
  await knex.raw(`
    ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN
      ('awaiting_payment', 'paid', 'in_progress', 'ready', 'completed', 'problem', 'cancelled', 'refunded'))
  `);
  await knex.raw(
    `ALTER TABLE orders ADD CONSTRAINT orders_confirmed_by_check CHECK (confirmed_by IS NULL OR confirmed_by IN ('customer', 'auto', 'ops'))`,
  );
  // A completed order always says when and by whom: the payout pickup and
  // the auto-confirm sweep both read these.
  await knex.raw(
    `ALTER TABLE orders ADD CONSTRAINT orders_completed_check CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND confirmed_by IS NOT NULL))`,
  );
  await knex.raw(
    `ALTER TABLE orders ADD CONSTRAINT orders_money_check CHECK (gross_amount > 0 AND commission_amount >= 0 AND merchant_net_amount = gross_amount - commission_amount)`,
  );

  // Quotes: originals stay one per outlet per request; extras live on an order.
  await knex.schema.alterTable("quotes", (table) => {
    table.dropUnique(["request_id", "outlet_id"]);
    table.string("kind", 10).notNullable().defaultTo("original");
    table.string("order_id", 34).nullable().references("id").inTable("orders").onDelete("RESTRICT");
    table.integer("commission_amount").nullable();
    table.integer("merchant_net_amount").nullable();
    table.timestamp("accepted_at", { useTz: true }).nullable();
    table.timestamp("paid_at", { useTz: true }).nullable();
    table.index(["order_id"]);
  });
  await knex.raw(`CREATE UNIQUE INDEX quotes_original_per_outlet ON quotes (request_id, outlet_id) WHERE kind = 'original'`);
  await knex.raw(`ALTER TABLE quotes ADD CONSTRAINT quotes_kind_check CHECK (kind IN ('original', 'extra'))`);
  await knex.raw(`ALTER TABLE quotes ADD CONSTRAINT quotes_extra_has_order CHECK (kind = 'original' OR order_id IS NOT NULL)`);
  await knex.raw(`ALTER TABLE quotes DROP CONSTRAINT quotes_status_check`);
  await knex.raw(
    `ALTER TABLE quotes ADD CONSTRAINT quotes_status_check CHECK (status IN ('sent', 'withdrawn', 'accepted', 'superseded', 'declined'))`,
  );
  // An accepted quote carries its snapshot, taken once at acceptance.
  await knex.raw(`
    ALTER TABLE quotes ADD CONSTRAINT quotes_accepted_snapshot CHECK (
      accepted_at IS NULL OR (commission_amount IS NOT NULL AND merchant_net_amount = total_amount - commission_amount)
    )
  `);

  await knex.schema.alterTable("payment_requests", (table) => {
    table.string("order_id", 34).nullable().references("id").inTable("orders").onDelete("RESTRICT");
    table.string("quote_id", 34).nullable().references("id").inTable("quotes").onDelete("RESTRICT");
    table.index(["order_id"]);
  });
  await knex.raw(`ALTER TABLE payment_requests ALTER COLUMN booking_id DROP NOT NULL`);
  await knex.raw(
    `ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_one_subject CHECK (num_nonnulls(booking_id, order_id) = 1)`,
  );
  await knex.raw(
    `ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_order_quote CHECK ((order_id IS NULL) = (quote_id IS NULL))`,
  );

  await knex.schema.alterTable("payout_run_lines", (table) => {
    table.string("order_id", 34).nullable().references("id").inTable("orders").onDelete("RESTRICT");
    // An order pays out exactly once, the same guard as booking_id.
    table.unique(["order_id"]);
  });
  await knex.raw(
    `ALTER TABLE payout_run_lines ADD CONSTRAINT payout_run_lines_one_subject CHECK (num_nonnulls(booking_id, order_id) <= 1)`,
  );

  await knex.schema.alterTable("refunds", (table) => {
    table.string("order_id", 34).nullable().references("id").inTable("orders").onDelete("RESTRICT");
  });
  await knex.raw(`ALTER TABLE refunds ALTER COLUMN booking_id DROP NOT NULL`);
  await knex.raw(`ALTER TABLE refunds ADD CONSTRAINT refunds_one_subject CHECK (num_nonnulls(booking_id, order_id) = 1)`);
  await knex.raw(`CREATE UNIQUE INDEX refunds_order_payment_reason ON refunds (payment_request_id, reason) WHERE order_id IS NOT NULL`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS refunds_order_payment_reason`);
  await knex.raw(`ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_one_subject`);
  await knex("refunds").whereNotNull("order_id").delete();
  await knex.raw(`ALTER TABLE refunds ALTER COLUMN booking_id SET NOT NULL`);
  await knex.schema.alterTable("refunds", (table) => table.dropColumn("order_id"));

  await knex.raw(`ALTER TABLE payout_run_lines DROP CONSTRAINT IF EXISTS payout_run_lines_one_subject`);
  await knex("payout_run_lines").whereNotNull("order_id").delete();
  await knex.schema.alterTable("payout_run_lines", (table) => {
    table.dropUnique(["order_id"]);
    table.dropColumn("order_id");
  });

  await knex.raw(`ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_order_quote`);
  await knex.raw(`ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_one_subject`);
  await knex("payment_requests").whereNotNull("order_id").delete();
  await knex.raw(`ALTER TABLE payment_requests ALTER COLUMN booking_id SET NOT NULL`);
  await knex.schema.alterTable("payment_requests", (table) => {
    table.dropIndex(["order_id"]);
    table.dropColumn("quote_id");
    table.dropColumn("order_id");
  });

  await knex.raw(`ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_accepted_snapshot`);
  await knex.raw(`ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check`);
  await knex.raw(`ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_extra_has_order`);
  await knex.raw(`ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_kind_check`);
  await knex.raw(`DROP INDEX IF EXISTS quotes_original_per_outlet`);
  await knex("quotes").where({ kind: "extra" }).delete();
  await knex("quotes").where({ status: "declined" }).update({ status: "withdrawn" });
  await knex.raw(
    `ALTER TABLE quotes ADD CONSTRAINT quotes_status_check CHECK (status IN ('sent', 'withdrawn', 'accepted', 'superseded'))`,
  );
  await knex.schema.alterTable("quotes", (table) => {
    table.dropIndex(["order_id"]);
    table.dropColumn("paid_at");
    table.dropColumn("accepted_at");
    table.dropColumn("merchant_net_amount");
    table.dropColumn("commission_amount");
    table.dropColumn("order_id");
    table.dropColumn("kind");
    table.unique(["request_id", "outlet_id"]);
  });

  await knex.schema.dropTableIfExists("orders");
  await knex.schema.dropTableIfExists("order_ref_daily_counters");
}

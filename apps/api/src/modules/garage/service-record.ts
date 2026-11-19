import { ApiError, kes } from "@cral/types";
import type { Knex } from "knex";
import { db } from "../../db/client.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { getOrCreateMerchant } from "../merchant/service.js";
import type { OutletRow } from "../outlets/service.js";
import type { OrderRow } from "./orders.js";
import { requireCar, serializeCar, type QuoteRequestRow, type QuoteRow } from "./service.js";

/**
 * The service record (Phase 4 GS4, docs/decisions/garage.md): every garage
 * job on a customer's car that reached `completed` (confirmed by the
 * customer, automatically 72 h after ready, or released by Ops). Nothing
 * is stored for it: the record is read from `orders`, so it can never say
 * more than the jobs that really happened.
 *
 * - The customer sees every completed job on their own car, from any
 *   garage (`GET /me/cars/:carId/service-record`).
 * - A garage sees only the jobs its own outlets completed on that car,
 *   reached through one of its own orders
 *   (`GET /merchant/garage-orders/:orderId/service-record`). Never another
 *   garage's work, never CRAL's fee: what the customer paid and what the
 *   garage kept, in shillings.
 *
 * Contracts: openapi/customer-garage.yaml, openapi/merchant-garage.yaml.
 */

interface LineRow {
  quote_id: string;
  position: number;
  kind: string;
  description: string;
  amount_amount: number;
}

type Page = { cursor?: string | undefined; limit: number };

/** The quotes that were paid for on each order, oldest first (the original, then extras). */
async function paidWork(orderIds: string[]) {
  const quotes = orderIds.length
    ? await db<QuoteRow>("quotes").whereIn("order_id", orderIds).whereNotNull("paid_at").orderBy("created_at", "asc")
    : [];
  const quoteIds = quotes.map((q) => q.id);
  const lines = quoteIds.length
    ? await db<LineRow>("quote_lines").whereIn("quote_id", quoteIds).orderBy("position", "asc")
    : [];
  const linesByQuote = new Map<string, LineRow[]>();
  for (const l of lines) linesByQuote.set(l.quote_id, [...(linesByQuote.get(l.quote_id) ?? []), l]);
  const byOrder = new Map<string, Array<{ quote: QuoteRow; lines: LineRow[] }>>();
  for (const q of quotes) {
    byOrder.set(q.order_id!, [...(byOrder.get(q.order_id!) ?? []), { quote: q, lines: linesByQuote.get(q.id) ?? [] }]);
  }
  return byOrder;
}

async function context(orders: OrderRow[]) {
  const requestIds = [...new Set(orders.map((o) => o.request_id))];
  const outletIds = [...new Set(orders.map((o) => o.outlet_id))];
  const [requests, outlets, work] = await Promise.all([
    requestIds.length ? db<QuoteRequestRow>("quote_requests").whereIn("id", requestIds) : [],
    outletIds.length ? db<OutletRow>("outlets").whereIn("id", outletIds) : [],
    paidWork(orders.map((o) => o.id)),
  ]);
  return {
    request: new Map(requests.map((r) => [r.id, r])),
    outlet: new Map(outlets.map((o) => [o.id, o])),
    work,
  };
}

const lineOut = (l: LineRow) => ({ kind: l.kind, description: l.description, amount: kes(l.amount_amount) });

async function completedPage(base: Knex.QueryBuilder<OrderRow>, query: Page) {
  const rows = await applyCursor(base.where({ status: "completed" }).whereNotNull("completed_at").select("*"), {
    sortColumn: "completed_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  return toPaginatedResult(rows as OrderRow[], query.limit, "completed_at");
}

export async function customerServiceRecord(userId: string, carId: string, query: Page) {
  const car = await requireCar(userId, carId);
  const paged = await completedPage(db<OrderRow>("orders").where({ user_id: userId, car_id: car.id }), query);
  const ctx = await context(paged.data);
  return {
    car: serializeCar(car),
    data: paged.data.map((o) => {
      const request = ctx.request.get(o.request_id);
      const outlet = ctx.outlet.get(o.outlet_id);
      return {
        order_id: o.id,
        ref: o.ref,
        service_type: request?.service_type ?? null,
        description: request?.description ?? null,
        outlet: outlet ? { name: outlet.name, address: outlet.address, county: outlet.county } : null,
        work: (ctx.work.get(o.id) ?? []).map(({ quote, lines }) => ({
          kind: quote.kind,
          lines: lines.map(lineOut),
          total: kes(quote.total_amount),
        })),
        total: kes(o.gross_amount),
        paid_at: o.paid_at?.toISOString() ?? null,
        completed_at: o.completed_at!.toISOString(),
        confirmed_by: o.confirmed_by,
      };
    }),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
  };
}

export async function merchantServiceRecord(userId: string, orderId: string, query: Page) {
  const merchant = await getOrCreateMerchant(userId);
  const order = await db<OrderRow>("orders").where({ id: orderId, merchant_id: merchant.id }).first();
  if (!order) {
    throw new ApiError({ status: 404, type: "not_found", code: "order_not_found", message: "That job isn't on your account." });
  }
  // Same car, this merchant's own jobs only.
  const paged = await completedPage(db<OrderRow>("orders").where({ car_id: order.car_id, merchant_id: merchant.id }), query);
  const ctx = await context(paged.data);
  return {
    data: paged.data.map((o) => {
      const request = ctx.request.get(o.request_id);
      return {
        order_id: o.id,
        ref: o.ref,
        service_type: request?.service_type ?? null,
        description: request?.description ?? null,
        outlet_name: ctx.outlet.get(o.outlet_id)?.name ?? null,
        lines: (ctx.work.get(o.id) ?? []).flatMap(({ lines }) => lines.map(lineOut)),
        total: kes(o.gross_amount),
        take_home: kes(o.merchant_net_amount),
        completed_at: o.completed_at!.toISOString(),
      };
    }),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
  };
}

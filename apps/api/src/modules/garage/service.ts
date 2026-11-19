import { ApiError, kes } from "@cral/types";
import type { Knex } from "knex";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { notify } from "../../lib/notifications.js";
import { enqueueNotificationDelivery } from "../../jobs/notification-delivery.js";
import { commissionRateFor, takeHome, type Vertical } from "../../lib/commission.js";
import { getOrCreateMerchant, type RequestContext } from "../merchant/service.js";
import { visitDateKey, type OutletRow } from "../outlets/service.js";
import {
  MAX_GARAGES,
  QUOTE_VALID_MS,
  type CarInput,
  type CreatePartsRequestInput,
  type CreateRequestInput,
  type QuoteInput,
} from "./schemas.js";

/**
 * Garage quotes (Phase 4 GS2 - docs/decisions/garage.md,
 * openapi/customer-garage.yaml, openapi/merchant-garage.yaml), and the same
 * engine for spare parts (Phase 5 PT1 - docs/decisions/parts.md): a parts
 * request goes to parts outlets and its quotes name the part's condition
 * and whether it is fitted or delivered.
 *
 * A customer's car, a request on it, and the garages' itemised quotes.
 * Nothing here moves money: accepting and paying a quote is `orders.ts`
 * (GS3). Every
 * state change is a conditional update on the status it checked, with
 * `audit_log` in the same transaction.
 */

// ---------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------

export interface CarRow {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  chassis_number: string | null;
  created_at: Date;
  updated_at: Date;
}

export type RequestStatus = "open" | "cancelled" | "accepted";
export type RequestKind = "service" | "part";

/** Which commission setting a request kind uses (owner decision 10). */
export const verticalOf = (kind: RequestKind): Vertical => (kind === "part" ? "parts" : "garage");
/** Which outlets a request kind goes to. */
const outletKindOf = (kind: RequestKind) => (kind === "part" ? "parts" : "garage");

export interface QuoteRequestRow {
  id: string;
  user_id: string;
  car_id: string;
  kind: RequestKind;
  /** Garage requests only; null on a parts request. */
  service_type: string | null;
  /** Parts requests only (PT1). */
  part_name: string | null;
  delivery_address: string | null;
  description: string;
  county: string;
  status: RequestStatus;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface TargetRow {
  request_id: string;
  outlet_id: string;
  merchant_id: string;
  declined_at: Date | null;
  created_at: Date;
}

export interface QuoteRow {
  id: string;
  request_id: string;
  outlet_id: string;
  merchant_id: string;
  status: "sent" | "withdrawn" | "accepted" | "superseded" | "declined";
  /** `extra` is a second quote on an order (GS3). */
  kind: "original" | "extra";
  order_id: string | null;
  /** Snapshots taken when the customer accepts (GS3). */
  commission_amount: number | null;
  merchant_net_amount: number | null;
  accepted_at: Date | null;
  paid_at: Date | null;
  days_needed: number;
  /** Parts quotes only (PT1); both set or both null. */
  part_condition: "genuine" | "oem" | "used" | null;
  fulfilment: "fitted" | "delivered" | null;
  updated_at?: Date;
  note: string | null;
  total_amount: number;
  total_currency: string;
  sent_at: Date;
  valid_until: Date;
  created_at: Date;
}

interface LineRow {
  id: string;
  quote_id: string;
  position: number;
  kind: string;
  description: string;
  amount_amount: number;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function notFound(code: string, message: string): never {
  throw new ApiError({ status: 404, type: "not_found", code, message });
}
function conflict(code: string, message: string): never {
  throw new ApiError({ status: 409, type: "conflict", code, message });
}
function invalid(code: string, message: string, field?: string): never {
  throw new ApiError({ status: 422, type: "validation_error", code, message, ...(field ? { field } : {}) });
}

async function audit(
  trx: Knex.Transaction,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  ctx: RequestContext,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): Promise<void> {
  await writeAuditEntry(trx, {
    actorId,
    actorType: "user",
    action,
    entityType,
    entityId,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    requestId: ctx.requestId,
    ip: ctx.ip,
  });
}

export function serializeCar(c: CarRow) {
  return {
    id: c.id,
    make: c.make,
    model: c.model,
    year: c.year,
    plate: c.plate,
    chassis_number: c.chassis_number,
    created_at: c.created_at.toISOString(),
  };
}

function rethrowCarTaken(err: unknown): never {
  if ((err as { code?: string; constraint?: string }).code === "23505") {
    conflict("car_exists", "That number plate is already in My cars.");
  }
  throw err;
}

function normalisePlate(p: string): string {
  return p.trim().toUpperCase().replace(/\s+/g, " ");
}

async function linesFor(quoteIds: string[]): Promise<Map<string, LineRow[]>> {
  const out = new Map<string, LineRow[]>(quoteIds.map((id) => [id, []]));
  if (!quoteIds.length) return out;
  const rows = await db<LineRow>("quote_lines").whereIn("quote_id", quoteIds).orderBy("position", "asc");
  for (const r of rows) out.get(r.quote_id)?.push(r);
  return out;
}

const lineOut = (l: LineRow) => ({ kind: l.kind, description: l.description, amount: kes(l.amount_amount) });
const isExpired = (q: QuoteRow) => q.valid_until.getTime() < Date.now();

// ---------------------------------------------------------------------
// My cars
// ---------------------------------------------------------------------

export async function listCars(userId: string, query: { cursor?: string | undefined; limit: number }) {
  const rows = await applyCursor(db<CarRow>("customer_cars").where({ user_id: userId }).select("*"), {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const paged = toPaginatedResult(rows as CarRow[], query.limit, "created_at");
  return { data: paged.data.map(serializeCar), next_cursor: paged.next_cursor, has_more: paged.has_more };
}

export async function requireCar(userId: string, carId: string): Promise<CarRow> {
  const car = await db<CarRow>("customer_cars").where({ id: carId, user_id: userId }).first();
  if (!car) notFound("car_not_found", "That car isn't in My cars.");
  return car;
}

export async function createCar(userId: string, input: CarInput, ctx: RequestContext) {
  const row = await db
    .transaction(async (trx) => {
      const [car] = await trx<CarRow>("customer_cars")
        .insert({
          id: generateId("customerCar"),
          user_id: userId,
          make: input.make,
          model: input.model,
          year: input.year,
          plate: normalisePlate(input.plate),
          chassis_number: input.chassis_number ?? null,
        })
        .returning("*");
      if (!car) throw new Error("Failed to add car");
      await audit(trx, userId, "car.created", "customer_car", car.id, ctx, undefined, { plate: car.plate });
      return car;
    })
    .catch(rethrowCarTaken);
  return serializeCar(row);
}

export async function updateCar(userId: string, carId: string, input: CarInput, ctx: RequestContext) {
  const car = await requireCar(userId, carId);
  const update = {
    make: input.make,
    model: input.model,
    year: input.year,
    plate: normalisePlate(input.plate),
    chassis_number: input.chassis_number ?? null,
  };
  const row = await db
    .transaction(async (trx) => {
      const [next] = await trx<CarRow>("customer_cars").where({ id: car.id }).update(update).returning("*");
      if (!next) throw new Error("Failed to update car");
      await audit(trx, userId, "car.updated", "customer_car", car.id, ctx, { plate: car.plate }, { plate: next.plate });
      return next;
    })
    .catch(rethrowCarTaken);
  return serializeCar(row);
}

export async function deleteCar(userId: string, carId: string, ctx: RequestContext) {
  const car = await requireCar(userId, carId);
  const used = await db("quote_requests").where({ car_id: car.id }).first("id");
  if (used) conflict("car_has_requests", "This car has garage or parts requests on it, so it stays on your account.");
  await db.transaction(async (trx) => {
    await audit(trx, userId, "car.deleted", "customer_car", car.id, ctx, { plate: car.plate });
    await trx("customer_cars").where({ id: car.id }).delete();
  });
}

// ---------------------------------------------------------------------
// Customer: requests
// ---------------------------------------------------------------------

/**
 * Up to 5 approved outlets of the request's kind in the county, one per
 * merchant, from approved merchants, oldest approval first. A garage must
 * also do the service asked for; a parts dealer has no service types.
 */
async function pickOutlets(trx: Knex.Transaction, kind: RequestKind, county: string, serviceType: string | null): Promise<OutletRow[]> {
  const rows = await trx<OutletRow>("outlets as o")
    .join("merchants as m", "m.id", "o.merchant_id")
    .where({ "o.kind": outletKindOf(kind), "o.status": "live", "o.county": county })
    .whereNotNull("m.approved_at")
    .modify((q) => {
      if (kind === "service") q.whereRaw("? = ANY(o.service_types)", [serviceType]);
    })
    .orderBy([{ column: "o.decided_at", order: "asc" }, { column: "o.id", order: "asc" }])
    .select("o.*");
  const seen = new Set<string>();
  const out: OutletRow[] = [];
  for (const o of rows) {
    if (seen.has(o.merchant_id)) continue;
    seen.add(o.merchant_id);
    out.push(o);
    if (out.length === MAX_GARAGES) break;
  }
  return out;
}

async function serializeRequest(r: QuoteRequestRow, withQuotes: boolean) {
  const [car, targets, quotes] = await Promise.all([
    db<CarRow>("customer_cars").where({ id: r.car_id }).first(),
    db<TargetRow>("quote_request_outlets").where({ request_id: r.id }),
    db<QuoteRow>("quotes").where({ request_id: r.id, kind: "original", status: "sent" }).orderBy("total_amount", "asc"),
  ]);
  // Once a quote is accepted the request points at its order (GS3).
  const order = r.status === "accepted" || r.status === "cancelled"
    ? ((await db("orders").where({ request_id: r.id }).first("id", "ref", "status")) as
        | { id: string; ref: string; status: string }
        | undefined)
    : undefined;
  const base = {
    id: r.id,
    kind: r.kind,
    car: car ? serializeCar(car) : null,
    service_type: r.service_type,
    part_name: r.part_name,
    delivery_address: r.delivery_address,
    description: r.description,
    county: r.county,
    status: r.status,
    garages_asked: targets.length,
    garages_declined: targets.filter((t) => t.declined_at).length,
    quote_count: quotes.length,
    order: order ? { id: order.id, ref: order.ref, status: order.status } : null,
    created_at: r.created_at.toISOString(),
  };
  if (!withQuotes) return base;
  const outlets = quotes.length
    ? await db<OutletRow>("outlets").whereIn(
        "id",
        quotes.map((q) => q.outlet_id),
      )
    : [];
  const lines = await linesFor(quotes.map((q) => q.id));
  return {
    ...base,
    quotes: quotes.map((q) => {
      const o = outlets.find((x) => x.id === q.outlet_id);
      return {
        id: q.id,
        outlet: o
          ? {
              id: o.id,
              name: o.name,
              county: o.county,
              address: o.address,
              // Only CRAL's recorded visit; never a default.
              visited_on: o.visited_on && o.visited_by ? visitDateKey(o.visited_on) : null,
            }
          : null,
        lines: (lines.get(q.id) ?? []).map(lineOut),
        total: kes(q.total_amount),
        days_needed: q.days_needed,
        part_condition: q.part_condition,
        fulfilment: q.fulfilment,
        note: q.note,
        sent_at: q.sent_at.toISOString(),
        valid_until: q.valid_until.toISOString(),
        expired: isExpired(q),
      };
    }),
  };
}

export async function createRequest(userId: string, input: CreateRequestInput, ctx: RequestContext) {
  const car = await requireCar(userId, input.car_id);
  const notices: Array<{ merchantId: string; id: string }> = [];
  const row = await db.transaction(async (trx) => {
    const outlets = await pickOutlets(trx, "service", input.county, input.service_type);
    if (!outlets.length) {
      invalid(
        "no_garages_in_county",
        `No garage CRAL has checked in ${input.county} does that yet. Try a nearby county.`,
        "county",
      );
    }
    const [req] = await trx<QuoteRequestRow>("quote_requests")
      .insert({
        id: generateId("quoteRequest"),
        user_id: userId,
        car_id: car.id,
        kind: "service",
        service_type: input.service_type,
        description: input.description,
        county: input.county,
        status: "open",
      })
      .returning("*");
    if (!req) throw new Error("Failed to create request");
    await trx("quote_request_outlets").insert(
      outlets.map((o) => ({ request_id: req.id, outlet_id: o.id, merchant_id: o.merchant_id })),
    );
    await audit(trx, userId, "garage_request.created", "quote_request", req.id, ctx, undefined, {
      car_id: car.id,
      service_type: req.service_type,
      county: req.county,
      outlet_ids: outlets.map((o) => o.id),
    });
    for (const o of outlets) {
      notices.push({
        merchantId: o.merchant_id,
        id: await notify(trx, {
          merchantId: o.merchant_id,
          category: "booking",
          title: `A quote request for ${o.name}`,
          body: `${car.year} ${car.make} ${car.model}: ${req.description.slice(0, 140)}`,
          ref: `${car.make} ${car.model}`,
          subjectType: "garage_request",
          subjectId: req.id,
        }),
      });
    }
    return req;
  });
  for (const n of notices) await enqueueNotificationDelivery(n.merchantId, [n.id]);
  return serializeRequest(row, true);
}

/**
 * A parts request (PT1): one part for one car in My cars, which must carry
 * its chassis number (dealers quote against it), sent to up to 5 live
 * parts outlets in the county. The delivery address is where a dealer
 * that delivers takes it; a dealer that fits it names its own premises.
 */
export async function createPartsRequest(userId: string, input: CreatePartsRequestInput, ctx: RequestContext) {
  const car = await requireCar(userId, input.car_id);
  if (!car.chassis_number) {
    invalid("car_needs_chassis", "Add the chassis number from the logbook to this car first. Dealers quote against it.", "car_id");
  }
  const notices: Array<{ merchantId: string; id: string }> = [];
  const row = await db.transaction(async (trx) => {
    const outlets = await pickOutlets(trx, "part", input.county, null);
    if (!outlets.length) {
      invalid("no_dealers_in_county", `No parts dealer CRAL has checked in ${input.county} yet. Try a nearby county.`, "county");
    }
    const [req] = await trx<QuoteRequestRow>("quote_requests")
      .insert({
        id: generateId("quoteRequest"),
        user_id: userId,
        car_id: car.id,
        kind: "part",
        service_type: null,
        part_name: input.part_name,
        delivery_address: input.delivery_address,
        description: input.description,
        county: input.county,
        status: "open",
      })
      .returning("*");
    if (!req) throw new Error("Failed to create request");
    await trx("quote_request_outlets").insert(
      outlets.map((o) => ({ request_id: req.id, outlet_id: o.id, merchant_id: o.merchant_id })),
    );
    await audit(trx, userId, "parts_request.created", "quote_request", req.id, ctx, undefined, {
      car_id: car.id,
      part_name: req.part_name,
      county: req.county,
      outlet_ids: outlets.map((o) => o.id),
    });
    for (const o of outlets) {
      notices.push({
        merchantId: o.merchant_id,
        id: await notify(trx, {
          merchantId: o.merchant_id,
          category: "booking",
          title: `A parts request for ${o.name}`,
          body: `${req.part_name} for a ${car.year} ${car.make} ${car.model}: ${req.description.slice(0, 120)}`,
          ref: `${car.make} ${car.model}`,
          subjectType: "garage_request",
          subjectId: req.id,
        }),
      });
    }
    return req;
  });
  for (const n of notices) await enqueueNotificationDelivery(n.merchantId, [n.id]);
  return serializeRequest(row, true);
}

export async function listMyRequests(
  userId: string,
  query: { kind?: RequestKind | undefined; cursor?: string | undefined; limit: number },
) {
  const rows = await applyCursor(db<QuoteRequestRow>("quote_requests").where({ user_id: userId, kind: query.kind ?? "service" }).select("*"), {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const paged = toPaginatedResult(rows as QuoteRequestRow[], query.limit, "created_at");
  return {
    data: await Promise.all(paged.data.map((r) => serializeRequest(r, false))),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
  };
}

async function requireMyRequest(userId: string, requestId: string): Promise<QuoteRequestRow> {
  const r = await db<QuoteRequestRow>("quote_requests").where({ id: requestId, user_id: userId }).first();
  if (!r) notFound("request_not_found", "That request isn't on your account.");
  return r;
}

export async function getMyRequest(userId: string, requestId: string) {
  return serializeRequest(await requireMyRequest(userId, requestId), true);
}

export async function cancelMyRequest(userId: string, requestId: string, ctx: RequestContext) {
  const r = await requireMyRequest(userId, requestId);
  const row = await db.transaction(async (trx) => {
    const [next] = await trx<QuoteRequestRow>("quote_requests")
      .where({ id: r.id, status: "open" })
      .update({ status: "cancelled", cancelled_at: new Date() })
      .returning("*");
    if (!next) conflict("request_not_open", "This request is already closed.");
    await audit(trx, userId, "garage_request.cancelled", "quote_request", r.id, ctx, { status: "open" }, { status: "cancelled" });
    return next;
  });
  return serializeRequest(row, true);
}

// ---------------------------------------------------------------------
// Merchant: requests and quotes
// ---------------------------------------------------------------------

async function requireTarget(userId: string, requestId: string) {
  const merchant = await getOrCreateMerchant(userId);
  const target = await db<TargetRow>("quote_request_outlets").where({ request_id: requestId, merchant_id: merchant.id }).first();
  if (!target) notFound("request_not_found", "That request wasn't sent to your garage.");
  const request = await db<QuoteRequestRow>("quote_requests").where({ id: requestId }).first();
  if (!request) notFound("request_not_found", "That request wasn't sent to your garage.");
  return { merchant, target, request };
}

async function serializeForMerchant(r: QuoteRequestRow, target: TargetRow, rates: Record<Vertical, number>) {
  const rate = rates[verticalOf(r.kind)];
  const [car, outlet, user, quote] = await Promise.all([
    db<CarRow>("customer_cars").where({ id: r.car_id }).first(),
    db<OutletRow>("outlets").where({ id: target.outlet_id }).first(),
    db<{ id: string; full_name: string | null }>("users").where({ id: r.user_id }).first("id", "full_name"),
    db<QuoteRow>("quotes").where({ request_id: r.id, outlet_id: target.outlet_id, kind: "original" }).first(),
  ]);
  const lines = quote ? ((await linesFor([quote.id])).get(quote.id) ?? []) : [];
  return {
    id: r.id,
    kind: r.kind,
    outlet: outlet ? { id: outlet.id, name: outlet.name } : null,
    car: car
      ? { make: car.make, model: car.model, year: car.year, plate: car.plate, chassis_number: car.chassis_number }
      : null,
    service_type: r.service_type,
    part_name: r.part_name,
    // Only the dealers asked to quote see where the part goes.
    delivery_address: r.delivery_address,
    description: r.description,
    county: r.county,
    customer_first_name: user?.full_name?.trim().split(/\s+/)[0] ?? null,
    status: r.status,
    declined: target.declined_at !== null,
    my_quote: quote
      ? {
          id: quote.id,
          status: quote.status,
          lines: lines.map(lineOut),
          total: kes(quote.total_amount),
          // Shillings only; the rate never leaves the server.
          take_home: kes(quote.merchant_net_amount ?? takeHome(quote.total_amount, rate)),
          days_needed: quote.days_needed,
          part_condition: quote.part_condition,
          fulfilment: quote.fulfilment,
          note: quote.note,
          sent_at: quote.sent_at.toISOString(),
          valid_until: quote.valid_until.toISOString(),
          expired: isExpired(quote),
          // Set once the customer accepted this quote (GS3).
          order_id: quote.order_id,
        }
      : null,
    created_at: r.created_at.toISOString(),
  };
}

export async function listMerchantRequests(
  userId: string,
  query: {
    filter: "to_quote" | "quoted" | "closed" | "all";
    kind?: RequestKind | undefined;
    cursor?: string | undefined;
    limit: number;
  },
) {
  const merchant = await getOrCreateMerchant(userId);
  const mine = db("quote_request_outlets").where({ merchant_id: merchant.id }).select("request_id");
  const quotedIds = db("quotes").where({ merchant_id: merchant.id, kind: "original", status: "sent" }).select("request_id");
  const declinedIds = db("quote_request_outlets").where({ merchant_id: merchant.id }).whereNotNull("declined_at").select("request_id");

  const scoped = (q: Knex.QueryBuilder) => {
    q.whereIn("id", mine);
    if (query.kind) q.where({ kind: query.kind });
    if (query.filter === "to_quote") q.where({ status: "open" }).whereNotIn("id", quotedIds).whereNotIn("id", declinedIds);
    if (query.filter === "quoted") q.where({ status: "open" }).whereIn("id", quotedIds);
    if (query.filter === "closed") q.where((b) => b.whereNot({ status: "open" }).orWhereIn("id", declinedIds));
    return q;
  };

  const toQuote = Number(
    (
      await db("quote_requests")
        .whereIn("id", mine)
        .modify((q) => {
          if (query.kind) q.where({ kind: query.kind });
        })
        .where({ status: "open" })
        .whereNotIn("id", quotedIds)
        .whereNotIn("id", declinedIds)
        .count<{ count: string }[]>("* as count")
    )[0]?.count ?? 0,
  );
  const rows = await applyCursor(scoped(db<QuoteRequestRow>("quote_requests").select("*")), {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const paged = toPaginatedResult(rows as QuoteRequestRow[], query.limit, "created_at");
  const targets = await db<TargetRow>("quote_request_outlets")
    .where({ merchant_id: merchant.id })
    .whereIn(
      "request_id",
      paged.data.map((r) => r.id),
    );
  const rates = await allRates();
  return {
    data: await Promise.all(
      paged.data.map((r) => serializeForMerchant(r, targets.find((t) => t.request_id === r.id)!, rates)),
    ),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
    counts: { to_quote: toQuote },
  };
}

export async function getMerchantRequest(userId: string, requestId: string) {
  const { target, request } = await requireTarget(userId, requestId);
  return serializeForMerchant(request, target, await allRates());
}

async function allRates(): Promise<Record<Vertical, number>> {
  const [garage, parts] = await Promise.all([commissionRateFor("garage"), commissionRateFor("parts")]);
  return { garage, parts };
}

export async function previewQuote(lines: Array<{ amount: number }>, kind: RequestKind = "service") {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { total: kes(total), take_home: kes(takeHome(total, await commissionRateFor(verticalOf(kind)))) };
}

export async function sendQuote(userId: string, requestId: string, input: QuoteInput, ctx: RequestContext) {
  const { merchant, target, request } = await requireTarget(userId, requestId);
  if (target.declined_at) conflict("request_declined", "You said this garage can't do the job.");
  const outlet = await db<OutletRow>("outlets").where({ id: target.outlet_id }).first();
  if (!outlet || outlet.status !== "live") {
    invalid("outlet_not_live", "These premises aren't taking requests right now. Resume them to quote.");
  }
  const partFields = quotePartFields(request.kind, input);
  const total = input.lines.reduce((s, l) => s + l.amount, 0);
  const now = new Date();

  await db.transaction(async (trx) => {
    // Lock the request row: a cancel racing a quote must not both win.
    const locked = await trx<QuoteRequestRow>("quote_requests").where({ id: request.id }).forUpdate().first();
    if (!locked || locked.status !== "open") conflict("request_not_open", "The customer has closed this request.");

    const existing = await trx<QuoteRow>("quotes")
      .where({ request_id: request.id, outlet_id: outlet.id, kind: "original" })
      .forUpdate()
      .first();
    if (existing && existing.status !== "sent" && existing.status !== "withdrawn") {
      conflict("quote_closed", "This quote can't be changed any more.");
    }
    const fields = {
      status: "sent" as const,
      days_needed: input.days_needed,
      ...partFields,
      note: input.note?.trim() || null,
      total_amount: total,
      total_currency: "KES",
      sent_at: now,
      valid_until: new Date(now.getTime() + QUOTE_VALID_MS),
    };
    let quoteId: string;
    if (existing) {
      await trx("quotes").where({ id: existing.id }).update(fields);
      await trx("quote_lines").where({ quote_id: existing.id }).delete();
      quoteId = existing.id;
    } else {
      quoteId = generateId("quote");
      await trx("quotes").insert({
        id: quoteId,
        request_id: request.id,
        outlet_id: outlet.id,
        merchant_id: merchant.id,
        ...fields,
      });
    }
    await trx("quote_lines").insert(
      input.lines.map((l, i) => ({
        id: generateId("quoteLine"),
        quote_id: quoteId,
        position: i,
        kind: l.kind,
        description: l.description,
        amount_amount: l.amount,
        amount_currency: "KES",
      })),
    );
    await audit(
      trx,
      userId,
      existing ? "quote.revised" : "quote.sent",
      "quote",
      quoteId,
      ctx,
      existing ? { total: existing.total_amount, status: existing.status } : undefined,
      { request_id: request.id, outlet_id: outlet.id, total, lines: input.lines.length, days_needed: input.days_needed, ...partFields },
    );
    // The customer's own feed (Migration B); no SMS for a quote.
    await notify(trx, {
      userId: request.user_id,
      category: "booking",
      title: existing ? `${outlet.name} changed its quote` : `A quote from ${outlet.name}`,
      body: `KES ${(total / 100).toLocaleString("en-KE")} for your ${request.kind === "part" ? request.part_name : `${request.service_type} request`}, valid 48 hours.`,
      ref: outlet.name,
      subjectType: "garage_request",
      subjectId: request.id,
    });
  });
  return getMerchantRequest(userId, requestId);
}

/**
 * A parts quote names the part's condition and whether the dealer fits it
 * at its premises or delivers it; a delivered part carries a priced
 * delivery line (owner decision 8: the dealer's own delivery, CRAL arranges
 * no riders). A garage quote names neither.
 */
function quotePartFields(kind: RequestKind, input: QuoteInput) {
  if (kind === "service") {
    if (input.part_condition || input.fulfilment) {
      invalid("not_a_parts_request", "Condition and delivery are for parts quotes only.", "part_condition");
    }
    return { part_condition: null, fulfilment: null };
  }
  if (!input.part_condition) invalid("part_condition_required", "Say whether the part is genuine, OEM or used.", "part_condition");
  if (!input.fulfilment) invalid("fulfilment_required", "Say whether you fit the part or deliver it.", "fulfilment");
  if (input.fulfilment === "delivered" && !input.lines.some((l) => l.kind === "delivery")) {
    invalid("delivery_line_required", "Add a delivery line with its price. The customer pays it with the part.", "lines");
  }
  if (input.fulfilment === "fitted" && input.lines.some((l) => l.kind === "delivery")) {
    invalid("delivery_line_not_needed", "A part you fit at your premises has no delivery line.", "lines");
  }
  return { part_condition: input.part_condition, fulfilment: input.fulfilment };
}

export async function withdrawQuote(userId: string, requestId: string, ctx: RequestContext) {
  const { target } = await requireTarget(userId, requestId);
  await db.transaction(async (trx) => {
    const [q] = await trx<QuoteRow>("quotes")
      .where({ request_id: requestId, outlet_id: target.outlet_id, kind: "original", status: "sent" })
      .update({ status: "withdrawn" })
      .returning("*");
    if (!q) conflict("no_quote", "There's no sent quote to withdraw.");
    await audit(trx, userId, "quote.withdrawn", "quote", q.id, ctx, { status: "sent" }, { status: "withdrawn" });
  });
  return getMerchantRequest(userId, requestId);
}

export async function declineRequest(userId: string, requestId: string, ctx: RequestContext) {
  const { target, request } = await requireTarget(userId, requestId);
  if (request.status !== "open") conflict("request_not_open", "This request is already closed.");
  await db.transaction(async (trx) => {
    const [t] = await trx<TargetRow>("quote_request_outlets")
      .where({ request_id: requestId, outlet_id: target.outlet_id })
      .whereNull("declined_at")
      .update({ declined_at: new Date() })
      .returning("*");
    if (!t) conflict("request_declined", "You've already said this garage can't do the job.");
    await trx("quotes")
      .where({ request_id: requestId, outlet_id: target.outlet_id, kind: "original", status: "sent" })
      .update({ status: "withdrawn" });
    await audit(trx, userId, "garage_request.declined", "quote_request", requestId, ctx, undefined, { outlet_id: target.outlet_id });
  });
  return getMerchantRequest(userId, requestId);
}

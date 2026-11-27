import type { Knex } from "knex";
import { ApiError, type Money } from "@cral/types";
import { db } from "../../db/client.js";
import { encodeCursor, decodeCursor } from "../../lib/pagination.js";
import { nairobiDayKey } from "../../lib/dates.js";
import { driverRates, readDriverPhotoBytes } from "../drivers/service.js";
import type { DriverRow, MerchantRow } from "../merchant/db-types.js";

/**
 * The public side of drivers (owner's call, 2026-10-18 - docs/plans/drivers.md).
 * A driver is hireable while they are `live`, their licence is in date and
 * their merchant's account is approved - the same "live listing on an
 * approved merchant" gate the vehicle catalog applies, plus the licence.
 *
 * The public projection is deliberately thin: the driver's full name (the
 * renter should know exactly who is coming - owner's call, 2026-10-19),
 * county, rates, and who they drive for. Never the national ID, KRA PIN,
 * licence number or phone.
 */

export function basePublicDriverQuery(): Knex.QueryBuilder {
  return db<DriverRow>("drivers as d")
    .join("merchants as m", "m.id", "d.merchant_id")
    .where("d.status", "live")
    .whereNotNull("m.approved_at")
    .where("d.licence_expiry", ">=", nairobiDayKey(new Date()));
}

type PublicRow = DriverRow & Pick<MerchantRow, "owner_type" | "company_name" | "trading_name" | "first_name" | "surname">;

const SELECT = [
  "d.*",
  "m.owner_type",
  "m.company_name",
  "m.trading_name",
  "m.first_name",
  "m.surname",
];

/** The name a renter sees - the driver's full name (owner's call, 2026-10-19). */
export function driverPublicName(fullName: string): string {
  return fullName.trim().replace(/\s+/g, " ") || "Driver";
}

export interface PublicDriver {
  id: string;
  display_name: string;
  county: string;
  rates: { day: Money | null; hour: Money | null; trip: Money | null };
  merchant_id: string;
  merchant_name: string;
  /** API path of the one photo, or null (DR2). A picture, not a check. */
  photo_url: string | null;
}

function serialize(row: PublicRow): PublicDriver {
  return {
    id: row.id,
    display_name: driverPublicName(row.full_name),
    county: row.county,
    rates: driverRates(row),
    merchant_id: row.merchant_id,
    // Same public owner name the vehicle catalog shows: the trading or
    // company name for a company, the first name only for a person.
    merchant_name:
      row.owner_type === "company"
        ? row.trading_name || row.company_name || "(no name on file)"
        : row.first_name || "(no name on file)",
    photo_url: row.photo_id ? `/catalog/drivers/${row.id}/photo/${row.photo_id}` : null,
  };
}

export type DriverSearchUnit = "day" | "hour" | "trip";

export interface DriverSearchQuery {
  county?: string | undefined;
  unit?: DriverSearchUnit | undefined;
  /** A window, both or neither (the route checks the pair). */
  pickup_at?: Date | undefined;
  dropoff_at?: Date | undefined;
  sort?: "recommended" | "price_asc" | "price_desc" | undefined;
  cursor?: string | undefined;
  limit: number;
}

const RATE_COLUMN: Record<DriverSearchUnit, string> = {
  day: "d.daily_rate_amount",
  hour: "d.hourly_rate_amount",
  trip: "d.trip_rate_amount",
};

/**
 * The search on `/drivers` (DR1, docs/plans/drivers-that-work.md): county,
 * the rate the renter wants, and a window. A driver on a confirmed or
 * active booking that overlaps the window is left out - the very rule
 * `customer-bookings/service.ts` refuses a request with
 * (`driver_unavailable`), on exact instants, so the list never shows a
 * driver the request would turn away.
 */
function filteredDrivers(query: DriverSearchQuery): Knex.QueryBuilder {
  const qb = basePublicDriverQuery();
  if (query.county) qb.whereRaw("lower(btrim(d.county)) = lower(btrim(?))", [query.county]);
  if (query.unit) qb.whereNotNull(RATE_COLUMN[query.unit]).where(RATE_COLUMN[query.unit], ">", 0);
  if (query.pickup_at && query.dropoff_at) {
    const pickupAt = query.pickup_at;
    const dropoffAt = query.dropoff_at;
    qb.whereNotExists(function () {
      this.select(db.raw("1"))
        .from("bookings as bk")
        .whereRaw("bk.driver_id = d.id")
        .whereIn("bk.status", ["confirmed", "active"])
        .where("bk.pickup_at", "<", dropoffAt)
        .where("bk.dropoff_at", ">", pickupAt);
    });
  }
  return qb;
}

// Truncated to the millisecond the cursor carries, as the vehicle catalog
// does: Postgres keeps microseconds, and a millisecond cursor compared to
// the raw column skips rows that share the last row's millisecond.
const CREATED_EXPR = "date_trunc('milliseconds', d.created_at)";

export async function listPublicDrivers(query: DriverSearchQuery) {
  const price = query.sort === "price_asc" || query.sort === "price_desc" ? query.unit : undefined;
  const expr = price ? RATE_COLUMN[price] : CREATED_EXPR;
  const direction = query.sort === "price_asc" ? "asc" : "desc";
  const op = direction === "desc" ? "<" : ">";
  const cast = price ? "::bigint" : "::timestamptz";

  const qb = filteredDrivers(query).select(SELECT);
  if (price) qb.select(db.raw(`${expr} as sort_value`));
  if (query.cursor) {
    const decoded = decodeCursor(query.cursor);
    if (decoded) {
      qb.whereRaw(`(${expr} ${op} ?${cast} or (${expr} = ?${cast} and d.id ${op} ?))`, [decoded.v, decoded.v, decoded.id]);
    }
  }
  const rows = (await qb
    .orderByRaw(`${expr} ${direction}`)
    .orderBy("d.id", direction)
    .limit(query.limit + 1)) as Array<PublicRow & { sort_value?: number | string }>;
  const countRow = (await filteredDrivers(query).count({ count: "*" }).first()) as { count: string | number } | undefined;
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const last = page[page.length - 1];
  return {
    data: page.map(serialize),
    next_cursor:
      hasMore && last
        ? encodeCursor({ v: price ? Number(last.sort_value) : last.created_at.toISOString(), id: last.id })
        : null,
    has_more: hasMore,
    total_count: Number(countRow?.count ?? 0),
  };
}

/** Counties that have a live driver, with how many - the picker on `/drivers`. */
export async function driverCounties(): Promise<{ counties: Array<{ county: string; count: number }> }> {
  const rows = (await basePublicDriverQuery()
    .whereRaw("btrim(d.county) <> ''")
    .select(db.raw("btrim(d.county) as county"))
    .count<{ county: string; count: string }[]>({ count: "*" })
    .groupByRaw("btrim(d.county)")) as unknown as Array<{ county: string; count: string | number }>;
  // "nairobi" and "Nairobi" are one county; keep the spelling most drivers use.
  const byKey = new Map<string, { label: string; best: number; total: number }>();
  for (const row of rows) {
    const n = Number(row.count);
    const key = row.county.toLowerCase();
    const entry = byKey.get(key);
    if (!entry) byKey.set(key, { label: row.county, best: n, total: n });
    else {
      entry.total += n;
      if (n > entry.best) Object.assign(entry, { label: row.county, best: n });
    }
  }
  const counties = [...byKey.values()]
    .map((e) => ({ county: e.label, count: e.total }))
    .sort((a, b) => b.count - a.count || a.county.localeCompare(b.county));
  return { counties };
}

/**
 * The drivers a renter can add to a self-drive car (owner's call,
 * 2026-10-19): the car's own owner's drivers first. Only when the owner has
 * none does the renter see other owners' drivers - those in the car's
 * county, or anyone if the county has none - and booking one splits the
 * request into two linked bookings (customer-bookings/service.ts).
 */
export async function driversForCar(car: {
  merchant_id: string;
  county: string | null;
}): Promise<{ source: "owner" | "other_owners"; data: PublicDriver[] }> {
  const own = (await basePublicDriverQuery()
    .where("d.merchant_id", car.merchant_id)
    .select(SELECT)
    .orderBy("d.created_at", "asc")) as PublicRow[];
  if (own.length) return { source: "owner", data: own.map(serialize) };

  const others = () =>
    basePublicDriverQuery().whereNot("d.merchant_id", car.merchant_id).select(SELECT).orderBy("d.created_at", "asc").limit(50);
  let rows = car.county ? ((await others().where("d.county", car.county)) as PublicRow[]) : [];
  if (!rows.length) rows = (await others()) as PublicRow[];
  return { source: "other_owners", data: rows.map(serialize) };
}

export async function requirePublicDriver(driverId: string): Promise<PublicRow> {
  const row = (await basePublicDriverQuery().where("d.id", driverId).select(SELECT).first()) as PublicRow | undefined;
  if (!row) {
    throw new ApiError({ status: 404, type: "not_found", code: "driver_not_found", message: "That driver isn't available." });
  }
  return row;
}

export async function getPublicDriver(driverId: string): Promise<PublicDriver> {
  return serialize(await requirePublicDriver(driverId));
}

/**
 * The photo behind `photo_url`: the same live-driver gate as the profile,
 * and only the current photo id, so an old URL dies with the old photo.
 */
export async function readPublicDriverPhoto(driverId: string, photoId: string) {
  const row = await requirePublicDriver(driverId);
  if (row.photo_id !== photoId) {
    throw new ApiError({ status: 404, type: "not_found", code: "photo_not_found", message: "That photo isn't available." });
  }
  return readDriverPhotoBytes(row);
}

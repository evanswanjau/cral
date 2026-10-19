import type { Knex } from "knex";
import { ApiError, type Money } from "@cral/types";
import { db } from "../../db/client.js";
import { encodeCursor, decodeCursor } from "../../lib/pagination.js";
import { nairobiDayKey } from "../../lib/dates.js";
import { driverRates } from "../drivers/service.js";
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
  };
}

export async function listPublicDrivers(query: { county?: string | undefined; cursor?: string | undefined; limit: number }) {
  let qb = basePublicDriverQuery().select(SELECT);
  if (query.county) qb = qb.where("d.county", query.county);
  if (query.cursor) {
    const decoded = decodeCursor(query.cursor);
    if (decoded) {
      qb = qb.where((b) => b.where("d.created_at", "<", decoded.v).orWhere((i) => i.where("d.created_at", decoded.v).andWhere("d.id", "<", decoded.id)));
    }
  }
  const rows = (await qb.orderBy("d.created_at", "desc").orderBy("d.id", "desc").limit(query.limit + 1)) as PublicRow[];
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const last = page[page.length - 1];
  return {
    data: page.map(serialize),
    next_cursor: hasMore && last ? encodeCursor({ v: last.created_at.toISOString(), id: last.id }) : null,
    has_more: hasMore,
  };
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

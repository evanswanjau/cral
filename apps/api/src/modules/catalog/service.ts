import type { Knex } from "knex";
import { ApiError, kes, type Money } from "@cral/types";
import { db } from "../../db/client.js";
import { encodeCursor, decodeCursor } from "../../lib/pagination.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import type { CatalogSearchQuery } from "./schemas.js";

/**
 * The public catalog. Every read here goes through `baseCatalogQuery`,
 * which is the ONE place the two gates live: a vehicle is public only when
 * it is a live listing AND its merchant is approved. Approving a car and
 * approving the business are separate decisions - a second copy of this
 * predicate is how a paused listing or an unverified merchant's car ends
 * up on the public site.
 *
 * The column projection is an allowlist. `select()` names every column; it
 * never does `vehicles.*` or `merchants.*`. Owner phone, email, national
 * ID, KRA PIN, payout details, documents and reviewer notes are not
 * selected, so a serializer bug cannot leak them. The exact
 * `pickup_address` is withheld until a booking is confirmed - only
 * `county` is public.
 */

let storageAdapter: ReturnType<typeof createStorageAdapter> | null = null;
function getStorageAdapter(): ReturnType<typeof createStorageAdapter> {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

interface CatalogRow {
  id: string;
  listing_ref: string | null;
  make: string;
  model: string;
  year: string;
  type: string;
  registration: string;
  transmission: string;
  fuel: string;
  colour: string | null;
  seats: number;
  chauffeured: boolean;
  county: string | null;
  daily_rate_amount: number;
  daily_rate_currency: string;
  verification_badge: string;
  minimum_hire_days: number;
  created_at: Date;
  merchant_id: string;
  m_owner_type: string;
  m_company_name: string | null;
  m_trading_name: string | null;
  m_first_name: string | null;
  m_created_at: Date;
}

const CATALOG_COLUMNS = [
  "v.id",
  "v.listing_ref",
  "v.make",
  "v.model",
  "v.year",
  "v.type",
  "v.registration",
  "v.transmission",
  "v.fuel",
  "v.colour",
  "v.seats",
  "v.chauffeured",
  "v.county",
  "v.daily_rate_amount",
  "v.daily_rate_currency",
  "v.verification_badge",
  "v.minimum_hire_days",
  "v.created_at",
  "v.merchant_id",
  "m.owner_type as m_owner_type",
  "m.company_name as m_company_name",
  "m.trading_name as m_trading_name",
  "m.first_name as m_first_name",
  "m.created_at as m_created_at",
] as const;

/** vehicles JOIN merchants, both gates applied. The only entry point. */
function baseCatalogQuery(): Knex.QueryBuilder {
  return db<CatalogRow>("vehicles as v")
    .join("merchants as m", "m.id", "v.merchant_id")
    .where("v.status", "live")
    .whereNotNull("m.approved_at");
}

function ownerName(row: Pick<CatalogRow, "m_owner_type" | "m_company_name" | "m_trading_name" | "m_first_name">): string {
  if (row.m_owner_type === "company") {
    return row.m_trading_name || row.m_company_name || "(no name on file)";
  }
  return row.m_first_name || "(no name on file)";
}

function photoPath(vehicleId: string, photoId: string): string {
  return `/catalog/vehicles/${vehicleId}/photos/${photoId}`;
}

/**
 * One batched pass over the auxiliary data a page of rows needs: how many
 * live listings each distinct owner has, and each vehicle's photo ids in
 * upload order. Avoids an N+1 per card.
 */
async function loadAux(rows: CatalogRow[]): Promise<{
  listedCount: Map<string, number>;
  photos: Map<string, string[]>;
}> {
  const listedCount = new Map<string, number>();
  const photos = new Map<string, string[]>();
  if (rows.length === 0) return { listedCount, photos };

  const merchantIds = [...new Set(rows.map((r) => r.merchant_id))];
  const vehicleIds = rows.map((r) => r.id);

  const [counts, photoRows] = await Promise.all([
    db("vehicles")
      .whereIn("merchant_id", merchantIds)
      .where("status", "live")
      .groupBy("merchant_id")
      .select("merchant_id")
      .count<{ merchant_id: string; count: string }[]>("* as count"),
    db("documents")
      .whereIn("vehicle_id", vehicleIds)
      .where("kind", "vehicle_photo")
      .orderBy("created_at", "asc")
      .select("id", "vehicle_id"),
  ]);

  for (const c of counts) listedCount.set(c.merchant_id, Number(c.count));
  for (const p of photoRows as { id: string; vehicle_id: string }[]) {
    const list = photos.get(p.vehicle_id) ?? [];
    list.push(p.id);
    photos.set(p.vehicle_id, list);
  }
  return { listedCount, photos };
}

function serializeSummary(
  row: CatalogRow,
  aux: { listedCount: Map<string, number>; photos: Map<string, string[]> },
) {
  const photoIds = aux.photos.get(row.id) ?? [];
  return {
    id: row.id,
    listing_ref: row.listing_ref,
    make: row.make,
    model: row.model,
    year: row.year,
    category: row.type,
    registration: row.registration,
    transmission: row.transmission.toLowerCase(),
    fuel: row.fuel,
    colour: row.colour,
    seats: row.seats,
    chauffeured: row.chauffeured,
    county: row.county,
    daily_rate: kes(row.daily_rate_amount) as Money,
    verified: row.verification_badge === "active",
    primary_photo_url: photoIds[0] ? photoPath(row.id, photoIds[0]) : null,
    owner: {
      display_name: ownerName(row),
      since: row.m_created_at.toISOString(),
      listed_count: aux.listedCount.get(row.merchant_id) ?? 1,
    },
    created_at: row.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------

interface SortConfig {
  column: "v.created_at" | "v.daily_rate_amount";
  key: "created_at" | "daily_rate_amount";
  direction: "asc" | "desc";
}

function sortConfig(sort: CatalogSearchQuery["sort"]): SortConfig {
  switch (sort) {
    case "price_asc":
      return { column: "v.daily_rate_amount", key: "daily_rate_amount", direction: "asc" };
    case "price_desc":
      return { column: "v.daily_rate_amount", key: "daily_rate_amount", direction: "desc" };
    // "recommended" has no real ranking signal yet (the design's is
    // completed hires) - newest-first until booking volume exists.
    case "newest":
    case "recommended":
    default:
      return { column: "v.created_at", key: "created_at", direction: "desc" };
  }
}

export async function listCatalog(query: CatalogSearchQuery) {
  const sort = sortConfig(query.sort);
  const qb = baseCatalogQuery().select(...CATALOG_COLUMNS);

  if (query.county) qb.whereRaw("lower(v.county) = lower(?)", [query.county]);
  if (query.category) qb.where("v.type", query.category);
  if (query.max_price !== undefined) qb.where("v.daily_rate_amount", "<=", query.max_price);
  if (query.seats_min !== undefined) qb.where("v.seats", ">=", query.seats_min);
  if (query.transmission) {
    qb.where("v.transmission", query.transmission === "automatic" ? "Automatic" : "Manual");
  }
  if (query.chauffeured !== undefined) qb.where("v.chauffeured", query.chauffeured);

  if (query.from && query.to) {
    // Day-granular overlap: a confirmed/active hire touching any day in
    // [from, to] takes the car out of the results. Hoisted out of the
    // closure so the narrowing survives.
    const from = query.from;
    const to = query.to;
    qb.whereNotExists(function () {
      this.select(db.raw("1"))
        .from("bookings as bk")
        .whereRaw("bk.vehicle_id = v.id")
        .whereIn("bk.status", ["confirmed", "active"])
        .whereRaw("bk.pickup_at::date <= ?", [to])
        .whereRaw("bk.dropoff_at::date >= ?", [from]);
    });
  }

  const op = sort.direction === "desc" ? "<" : ">";
  if (query.cursor) {
    const decoded = decodeCursor(query.cursor);
    if (decoded) {
      qb.where((b) => {
        b.where(sort.column, op, decoded.v).orWhere((inner) => {
          inner.where(sort.column, "=", decoded.v).andWhere("v.id", op, decoded.id);
        });
      });
    }
  }

  qb.orderBy(sort.column, sort.direction).orderBy("v.id", sort.direction).limit(query.limit + 1);

  const fetched = (await qb) as CatalogRow[];
  const hasMore = fetched.length > query.limit;
  const rows = hasMore ? fetched.slice(0, query.limit) : fetched;
  const aux = await loadAux(rows);
  const last = rows[rows.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          v: sort.key === "created_at" ? last.created_at.toISOString() : last.daily_rate_amount,
          id: last.id,
        })
      : null;

  return {
    data: rows.map((r) => serializeSummary(r, aux)),
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

// ---------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------

export async function getCatalogVehicle(id: string) {
  const row = (await baseCatalogQuery().where("v.id", id).select(...CATALOG_COLUMNS).first()) as
    | CatalogRow
    | undefined;
  if (!row) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "vehicle_not_found",
      message: "That listing isn't available.",
    });
  }

  const aux = await loadAux([row]);
  const photoIds = aux.photos.get(row.id) ?? [];
  return {
    ...serializeSummary(row, aux),
    minimum_hire_days: row.minimum_hire_days,
    photo_urls: photoIds.map((pid) => photoPath(row.id, pid)),
  };
}

// ---------------------------------------------------------------------
// Photo bytes
// ---------------------------------------------------------------------

export async function readCatalogPhoto(vehicleId: string, photoId: string) {
  // Scoped by the vehicle id, so the two gates decide whether the photo
  // exists at all.
  const vehicle = await baseCatalogQuery().where("v.id", vehicleId).select("v.id").first();
  if (!vehicle) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "vehicle_not_found",
      message: "That listing isn't available.",
    });
  }

  const doc = await db("documents")
    .where({ id: photoId, vehicle_id: vehicleId, kind: "vehicle_photo" })
    .first<{ storage_key: string; content_type: string; original_name: string } | undefined>();
  if (!doc) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "photo_not_found",
      message: "That photo isn't available.",
    });
  }

  const body = await getStorageAdapter()
    .getObject(doc.storage_key)
    .catch(() => {
      throw new ApiError({
        status: 404,
        type: "not_found",
        code: "photo_bytes_missing",
        message: "That photo is no longer stored.",
      });
    });

  return { body, contentType: doc.content_type, originalName: doc.original_name };
}

// ---------------------------------------------------------------------
// Collections - the home page rails
// ---------------------------------------------------------------------

const COLLECTION_LIMIT = 8;

interface CollectionDef {
  key: string;
  kicker: string;
  title: string;
  sub: string;
  apply: (qb: Knex.QueryBuilder) => void;
}

const COLLECTION_DEFS: CollectionDef[] = [
  {
    key: "popular",
    kicker: "MOST BOOKED",
    title: "What renters actually book",
    sub: "The cars that leave the yard most often, ranked by completed hires, not by who paid us.",
    apply: () => {},
  },
  {
    key: "roadtrip",
    kicker: "OUT OF TOWN",
    title: "Built for Naivasha, Amboseli and the Mara",
    sub: "High clearance, honest tyres and owners who expect the car to leave the city.",
    apply: (qb) => qb.whereIn("v.type", ["suv", "truck"]),
  },
  {
    key: "weekend",
    kicker: "FRIDAY TO SUNDAY",
    title: "Most requested for weekends",
    sub: "Friday evening out, Sunday night back. Book by Thursday, these go first.",
    apply: () => {},
  },
  {
    key: "budget",
    kicker: "CHEAPEST CLEARED",
    title: "Under four thousand, papers still read",
    sub: "The bottom of the price list is held to exactly the same documents.",
    apply: (qb) => qb.where("v.daily_rate_amount", "<=", 400_000),
  },
  {
    key: "family",
    kicker: "FAMILY SIZED",
    title: "Everyone fits, luggage included",
    sub: "Vans and seven-seaters for school runs, funerals, airport collections and shags.",
    apply: (qb) => qb.where("v.seats", ">=", 7),
  },
  {
    key: "executive",
    kicker: "ARRIVE WELL",
    title: "For the day it has to look right",
    sub: "Weddings, client pitches, delegations. Owners who valet before every hire.",
    apply: (qb) => qb.where("v.daily_rate_amount", ">=", 1_000_000),
  },
  {
    key: "airport",
    kicker: "LAND AND DRIVE",
    title: "Waiting at JKIA and Wilson",
    sub: "Owners who deliver to arrivals and wait out a delayed flight if you give them the number.",
    apply: (qb) => qb.where("v.chauffeured", true),
  },
  {
    key: "upcountry",
    kicker: "MURRAM RATED",
    title: "Cars whose owners say yes to murram",
    sub: "Sites, shambas, boreholes and the last twelve kilometres that are not tarmac.",
    apply: (qb) => qb.whereIn("v.type", ["suv", "truck"]),
  },
];

export async function getCollections() {
  // One query per rail (each small and capped), then a single batched
  // aux pass over the union so owner counts and photos aren't refetched
  // per rail.
  const rowsByKey = await Promise.all(
    COLLECTION_DEFS.map(async (def) => {
      const qb = baseCatalogQuery().select(...CATALOG_COLUMNS);
      def.apply(qb);
      qb.orderBy("v.created_at", "desc").orderBy("v.id", "desc").limit(COLLECTION_LIMIT);
      return { def, rows: (await qb) as CatalogRow[] };
    }),
  );

  const allRows = rowsByKey.flatMap((r) => r.rows);
  const dedup = new Map(allRows.map((r) => [r.id, r]));
  const aux = await loadAux([...dedup.values()]);

  return {
    collections: rowsByKey.map(({ def, rows }) => ({
      key: def.key,
      kicker: def.kicker,
      title: def.title,
      sub: def.sub,
      vehicles: rows.map((r) => serializeSummary(r, aux)),
    })),
  };
}

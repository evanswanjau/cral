import type { Knex } from "knex";
import { ApiError, kes, type Money } from "@cral/types";
import { db } from "../../db/client.js";
import { encodeCursor, decodeCursor } from "../../lib/pagination.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import { VEHICLE_DOC_KINDS } from "../vehicles/service.js";
import { ratingSummaries, vehicleReviews, type RatingSummary } from "../../lib/ratings.js";
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
  m_user_id: string;
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
  "m.user_id as m_user_id",
] as const;

/**
 * vehicles JOIN merchants, both gates applied. The only entry point.
 *
 * Exported because `modules/customer-bookings` must answer the same
 * question - "can a renter act on this car?" - and a second copy of the
 * predicate is how a paused listing or an unapproved merchant's car
 * becomes bookable while being invisible in search, or the reverse.
 */
export function baseCatalogQuery(): Knex.QueryBuilder {
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
 * live listings each distinct owner has, each vehicle's photo ids in
 * upload order, and each owner's aggregate rating. Avoids an N+1 per card.
 */
async function loadAux(rows: CatalogRow[]): Promise<{
  listedCount: Map<string, number>;
  photos: Map<string, string[]>;
  ownerRatings: Map<string, RatingSummary>;
}> {
  const listedCount = new Map<string, number>();
  const photos = new Map<string, string[]>();
  let ownerRatings = new Map<string, RatingSummary>();
  if (rows.length === 0) return { listedCount, photos, ownerRatings };

  const merchantIds = [...new Set(rows.map((r) => r.merchant_id))];
  const vehicleIds = rows.map((r) => r.id);

  // Keyed by the merchant's `user_id`, which is what `ratings.ratee_id`
  // holds for a `merchant` ratee - same id the detail endpoint reads.
  const ownerUserIds = rows.map((r) => r.m_user_id);

  const [counts, photoRows, ratings] = await Promise.all([
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
    ratingSummaries(ownerUserIds, "merchant"),
  ]);
  ownerRatings = ratings;

  for (const c of counts) listedCount.set(c.merchant_id, Number(c.count));
  for (const p of photoRows as { id: string; vehicle_id: string }[]) {
    const list = photos.get(p.vehicle_id) ?? [];
    list.push(p.id);
    photos.set(p.vehicle_id, list);
  }
  return { listedCount, photos, ownerRatings };
}

function serializeSummary(
  row: CatalogRow,
  aux: {
    listedCount: Map<string, number>;
    photos: Map<string, string[]>;
    ownerRatings: Map<string, RatingSummary>;
  },
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
      // null (never an all-zero shape) until a hirer has actually rated
      // this owner - the card renders nothing rather than "0.0".
      rating: aux.ownerRatings.get(row.m_user_id) ?? null,
    },
    created_at: row.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------

/**
 * The owner's average rating, joined per merchant. Kept as its own
 * derived table rather than a correlated subquery so the sort, the
 * keyset cursor and the page all read one aggregate, computed once.
 */
const RATING_JOIN = `left join (
    select ratee_id, avg(stars) as avg_stars
    from ratings
    where ratee_type = 'merchant'
    group by ratee_id
  ) as rt on rt.ratee_id = m.user_id`;

/** Unrated owners sort last, never in the middle - hence coalesce to 0. */
const RATING_EXPR = "coalesce(rt.avg_stars, 0)";

interface SortConfig {
  /** The SQL ordered on - also what the keyset cursor compares against. */
  expr: string;
  key: "created_at" | "daily_rate_amount" | "rating";
  direction: "asc" | "desc";
}

function sortConfig(sort: CatalogSearchQuery["sort"]): SortConfig {
  switch (sort) {
    case "price_asc":
      return { expr: "v.daily_rate_amount", key: "daily_rate_amount", direction: "asc" };
    case "price_desc":
      return { expr: "v.daily_rate_amount", key: "daily_rate_amount", direction: "desc" };
    case "rating_desc":
      return { expr: RATING_EXPR, key: "rating", direction: "desc" };
    // "recommended" has no real ranking signal yet (the design's is
    // completed hires) - newest-first until booking volume exists.
    case "newest":
    case "recommended":
    default:
      return { expr: "v.created_at", key: "created_at", direction: "desc" };
  }
}

export async function listCatalog(query: CatalogSearchQuery) {
  const sort = sortConfig(query.sort);
  const qb = baseCatalogQuery().select(...CATALOG_COLUMNS);
  if (sort.key === "rating") {
    // The raw average is selected, not the rounded one the card shows:
    // a cursor built from a rounded value would skip or repeat rows at
    // the page boundary wherever two owners round to the same figure.
    qb.joinRaw(RATING_JOIN).select(db.raw(`${RATING_EXPR} as sort_rating`));
  }

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
      if (sort.key === "rating") {
        qb.whereRaw(
          `(${RATING_EXPR} ${op} ?::numeric or (${RATING_EXPR} = ?::numeric and v.id ${op} ?))`,
          [decoded.v, decoded.v, decoded.id],
        );
      } else {
        qb.where((b) => {
          b.where(sort.expr, op, decoded.v).orWhere((inner) => {
            inner.where(sort.expr, "=", decoded.v).andWhere("v.id", op, decoded.id);
          });
        });
      }
    }
  }

  if (sort.key === "rating") {
    qb.orderByRaw(`${RATING_EXPR} ${sort.direction}`);
  } else {
    qb.orderBy(sort.expr, sort.direction);
  }
  qb.orderBy("v.id", sort.direction).limit(query.limit + 1);

  const fetched = (await qb) as Array<CatalogRow & { sort_rating?: string | number }>;
  const hasMore = fetched.length > query.limit;
  const rows = hasMore ? fetched.slice(0, query.limit) : fetched;
  const aux = await loadAux(rows);
  const last = rows[rows.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          v:
            sort.key === "created_at"
              ? last.created_at.toISOString()
              : sort.key === "rating"
                ? Number(last.sort_rating ?? 0)
                : last.daily_rate_amount,
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

/**
 * "What CRAL checked on this car" - a document cleared or not, never the
 * document itself. `logbook_name_match` is deliberately not a check here
 * (no OCR in this product, per the admin review module's own rule) - this
 * only reports what a human reviewer actually decided.
 */
const DOC_LABELS: Record<(typeof VEHICLE_DOC_KINDS)[number], string> = {
  logbook: "Logbook",
  comprehensive_insurance: "Comprehensive insurance",
  tracker_certificate: "Tracker certificate",
};

async function documentsClearedFor(vehicleId: string) {
  const rows = await db("documents")
    .where({ vehicle_id: vehicleId })
    .whereIn("kind", VEHICLE_DOC_KINDS)
    .select("kind", "review_state");
  const byKind = new Map(rows.map((r) => [r.kind as string, r.review_state as string]));
  return VEHICLE_DOC_KINDS.map((kind) => ({
    kind,
    label: DOC_LABELS[kind],
    cleared: byKind.get(kind) === "ok",
  }));
}

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

  const [aux, documentsCleared, hires] = await Promise.all([
    loadAux([row]),
    documentsClearedFor(row.id),
    // "From people who hired it" - this car's own reviews, not the
    // owner's whole-account score. The two are different sets and the
    // page shows them under different headings.
    vehicleReviews(row.id),
  ]);
  // Nothing writes a hirer->merchant rating yet (no completed customer
  // hires exist) - this stays null honestly rather than fabricate a
  // score, exactly the fix that removed the hardcoded id_verified badge.
  // Same map the card's `owner.rating` reads, so the two can't disagree.
  const ownerRating = aux.ownerRatings.get(row.m_user_id) ?? null;
  const photoIds = aux.photos.get(row.id) ?? [];
  return {
    ...serializeSummary(row, aux),
    minimum_hire_days: row.minimum_hire_days,
    photo_urls: photoIds.map((pid) => photoPath(row.id, pid)),
    documents_cleared: documentsCleared,
    owner_rating: ownerRating,
    rating: hires.rating,
    reviews: hires.reviews,
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
    title: "Most hired in Kenya",
    sub: "The cars that leave the yard most often, ranked by completed hires, not by who paid us.",
    apply: () => {},
  },
  {
    key: "roadtrip",
    kicker: "OUT OF TOWN",
    title: "Ready for the open road",
    sub: "High clearance, honest tyres and owners who expect the car to leave the city.",
    apply: (qb) => qb.whereIn("v.type", ["suv", "truck"]),
  },
  {
    key: "weekend",
    kicker: "FRIDAY TO SUNDAY",
    title: "Weekend favorites",
    sub: "Friday evening out, Sunday night back. Book by Thursday, these go first.",
    apply: () => {},
  },
  {
    key: "budget",
    kicker: "CHEAPEST CLEARED",
    title: "Budget friendly",
    sub: "The bottom of the price list is held to exactly the same documents.",
    apply: (qb) => qb.where("v.daily_rate_amount", "<=", 400_000),
  },
  {
    key: "family",
    kicker: "FAMILY SIZED",
    title: "Best for the whole family",
    sub: "Vans and seven-seaters for school runs, funerals, airport collections and shags.",
    apply: (qb) => qb.where("v.seats", ">=", 7),
  },
  {
    key: "executive",
    kicker: "ARRIVE WELL",
    title: "Executive",
    sub: "Weddings, client pitches, delegations. Owners who valet before every hire.",
    // Price alone isn't enough here: a lorry or an excavator clears KES
    // 10,000/day easily, and this rail's own copy says weddings and client
    // pitches. Cars only.
    apply: (qb) => qb.where("v.daily_rate_amount", ">=", 1_000_000).whereIn("v.type", ["sedan", "suv"]),
  },
  {
    key: "airport",
    kicker: "LAND AND DRIVE",
    title: "Best for airport pickups",
    sub: "Owners who deliver to arrivals and wait out a delayed flight if you give them the number.",
    apply: (qb) => qb.where("v.chauffeured", true),
  },
  {
    key: "upcountry",
    kicker: "MURRAM RATED",
    title: "Best for travelling upcountry",
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

/**
 * Counties that actually have something to hire, with how many.
 *
 * The home page's county filter used to be a fixed seven-county list
 * copied from the design canvas, so most of its options led to an empty
 * result page - a choice that isn't one. `vehicles.county` is free text
 * (a merchant types it at onboarding), so this normalises for display:
 * trimmed, grouped case-insensitively, and the most common spelling of
 * each wins. Ordered by count descending so the busiest county leads,
 * then by name so the tail is stable between calls.
 */
export async function getCounties(): Promise<{
  counties: Array<{ county: string; vehicle_count: number }>;
}> {
  const rows = (await baseCatalogQuery()
    .whereNotNull("v.county")
    .whereRaw("btrim(v.county) <> ''")
    .select("v.county")
    .count<{ county: string; count: string }[]>({ count: "*" })
    .groupBy("v.county")) as unknown as Array<{ county: string; count: string | number }>;

  // Two merchants typing "nairobi" and "Nairobi" are one county to a
  // hirer. Fold on a case-insensitive key, keep the spelling that the
  // most listings use.
  const byKey = new Map<string, { spellings: Map<string, number>; total: number }>();
  for (const row of rows) {
    const label = String(row.county).trim();
    if (!label) continue;
    const n = Number(row.count);
    const key = label.toLowerCase();
    const entry = byKey.get(key) ?? { spellings: new Map<string, number>(), total: 0 };
    entry.spellings.set(label, (entry.spellings.get(label) ?? 0) + n);
    entry.total += n;
    byKey.set(key, entry);
  }

  const counties = [...byKey.values()]
    .map((entry) => {
      const [label] = [...entry.spellings.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]!;
      return { county: label, vehicle_count: entry.total };
    })
    .sort((a, b) => b.vehicle_count - a.vehicle_count || a.county.localeCompare(b.county));

  return { counties };
}

import { db } from "../db/client.js";

export type RateeType = "hirer" | "merchant";

/** A ratee's aggregate score. `null` (not zero) when nobody has rated them. */
export interface RatingSummary {
  average: number; // one decimal place
  count: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * `ratee_id -> RatingSummary` for every id in the list that has at least
 * one rating of the given type. Batched so a list endpoint stays one
 * query, not one per row.
 */
export async function ratingSummaries(rateeIds: string[], rateeType: RateeType): Promise<Map<string, RatingSummary>> {
  const out = new Map<string, RatingSummary>();
  const unique = [...new Set(rateeIds)];
  if (unique.length === 0) return out;

  const rows = (await db("ratings")
    .whereIn("ratee_id", unique)
    .andWhere({ ratee_type: rateeType })
    .groupBy("ratee_id")
    .select("ratee_id")
    .avg({ avg: "stars" })
    .count({ count: "*" })) as Array<{ ratee_id: string; avg: string | number; count: string | number }>;

  for (const r of rows) {
    out.set(r.ratee_id, { average: round1(Number(r.avg)), count: Number(r.count) });
  }
  return out;
}

/** Aggregate score for a single ratee, or `null` if unrated. */
export async function ratingSummary(rateeId: string, rateeType: RateeType): Promise<RatingSummary | null> {
  const map = await ratingSummaries([rateeId], rateeType);
  return map.get(rateeId) ?? null;
}

// ---------------------------------------------------------------------
// Per-vehicle reads
// ---------------------------------------------------------------------

/**
 * One review a renter left about an owner, on a hire of one particular
 * car. The rater is named as first name + last initial ("Wanjiku N.") -
 * what the design shows, and as much as a stranger browsing a listing
 * needs. Never the rater's id, email or phone.
 *
 * `when` is the raw UTC instant; the month/year the design renders is a
 * display decision and belongs to the client (spec §2).
 */
export interface VehicleReview {
  id: string;
  who: string;
  stars: number;
  text: string | null;
  when: string;
}

/** `Wanjiku Njeri` -> `Wanjiku N.`; a blank name falls back to "A renter". */
function shortName(full: string | null): string {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A renter";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]!} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}

/**
 * Ratings left on bookings for ONE vehicle, in the merchant direction.
 *
 * Deliberately distinct from `ratingSummaries(ids, "merchant")`, which is
 * an owner's whole-account score across every car they list. A listing
 * page's "From people who hired it" claims to be about that car, so it is
 * aggregated over that car's own bookings - conflating the two would put
 * a number under a heading that does not describe it.
 *
 * Returns the aggregate over *every* such rating (never page-bound) plus
 * the newest `limit` of them to render. `rating` is `null`, never an
 * all-zero shape, until someone has actually rated.
 */
export async function vehicleReviews(
  vehicleId: string,
  limit = 10,
): Promise<{ rating: RatingSummary | null; reviews: VehicleReview[] }> {
  const scoped = () =>
    db("ratings as r")
      .join("bookings as b", "b.id", "r.booking_id")
      .where("b.vehicle_id", vehicleId)
      .andWhere("r.ratee_type", "merchant");

  const [agg, rows] = await Promise.all([
    scoped().avg({ avg: "r.stars" }).count({ count: "*" }).first() as Promise<
      { avg: string | number | null; count: string | number } | undefined
    >,
    scoped()
      .join("users as u", "u.id", "r.rater_id")
      .orderBy("r.created_at", "desc")
      .limit(limit)
      .select("r.id", "r.stars", "r.comment", "r.created_at", "u.full_name") as Promise<
      Array<{ id: string; stars: number; comment: string | null; created_at: Date; full_name: string | null }>
    >,
  ]);

  const count = Number(agg?.count ?? 0);
  return {
    rating: count > 0 ? { average: round1(Number(agg!.avg)), count } : null,
    reviews: rows.map((r) => ({
      id: r.id,
      who: shortName(r.full_name),
      stars: r.stars,
      text: r.comment,
      when: r.created_at.toISOString(),
    })),
  };
}

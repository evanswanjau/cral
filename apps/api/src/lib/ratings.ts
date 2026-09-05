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

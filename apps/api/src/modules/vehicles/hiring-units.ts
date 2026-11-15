import type { VehicleCategory } from "./categories.js";

/**
 * The hiring-cadence vocabulary (owner's call, 2026-09-23) — a separate
 * axis from `VehicleCategory` (body type). `day` is the existing default
 * and the only unit that ever existed before this; `hour` and `trip` are
 * new. The mirror on the client is
 * `apps/merchant/src/lib/hiring-units.ts` — keep the two in step.
 */
export const HIRING_UNITS = ["day", "hour", "trip", "km", "tonne"] as const;
export type HiringUnit = (typeof HIRING_UNITS)[number];

export const HIRING_UNIT_LABELS: Record<HiringUnit, string> = {
  day: "Per day",
  hour: "Per hour",
  trip: "Per trip",
  km: "Per km",
  tonne: "Per tonne",
};

/**
 * Per-km and per-tonne (PR T3), trucks only. Distance isn't measured
 * anywhere in this product, so a listing on either unit is always priced
 * by a quote once the merchant has seen the route - the rate is a guide.
 * Per tonne is a flat price per tonne, not per tonne-km (decided
 * 2026-11-10).
 */
export const QUOTE_ONLY_UNITS: readonly HiringUnit[] = ["km", "tonne"];

/** Does a request on this listing start as a quote request rather than an instant price? */
export function needsQuote(vehicle: { hiring_unit: string; quote_required: boolean }): boolean {
  return vehicle.quote_required || (QUOTE_ONLY_UNITS as readonly string[]).includes(vehicle.hiring_unit);
}

/**
 * A *suggested* default per category, not a hard lock — the feedback that
 * produced this said "mainly applies to", not "only applies to", so a
 * merchant can still pick any unit for any category. Read by the merchant
 * client when a listing is first switched to a category with no unit
 * chosen yet; never enforced server-side.
 */
export const SUGGESTED_HIRING_UNIT: Record<VehicleCategory, HiringUnit> = {
  sedan: "day",
  suv: "day",
  van: "day",
  truck: "trip",
  machinery: "hour",
};

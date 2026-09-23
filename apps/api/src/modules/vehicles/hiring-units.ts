import type { VehicleCategory } from "./categories.js";

/**
 * The hiring-cadence vocabulary (owner's call, 2026-09-23) — a separate
 * axis from `VehicleCategory` (body type). `day` is the existing default
 * and the only unit that ever existed before this; `hour` and `trip` are
 * new. The mirror on the client is
 * `apps/merchant/src/lib/hiring-units.ts` — keep the two in step.
 */
export const HIRING_UNITS = ["day", "hour", "trip"] as const;
export type HiringUnit = (typeof HIRING_UNITS)[number];

export const HIRING_UNIT_LABELS: Record<HiringUnit, string> = {
  day: "Per day",
  hour: "Per hour",
  trip: "Per trip",
};

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

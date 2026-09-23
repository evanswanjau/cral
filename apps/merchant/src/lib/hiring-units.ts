/**
 * Hiring cadence (owner's call, 2026-09-23) - mirrors
 * `apps/api/src/modules/vehicles/hiring-units.ts`. Keep the two in step.
 */
export const HIRING_UNITS = ["day", "hour", "trip"] as const;
export type HiringUnit = (typeof HIRING_UNITS)[number];

export const HIRING_UNIT_LABELS: Record<HiringUnit, string> = {
  day: "Per day",
  hour: "Per hour",
  trip: "Per trip",
};

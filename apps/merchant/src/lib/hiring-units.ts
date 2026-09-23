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

/**
 * What a merchant can pick today. `hour` is refused by the API until the
 * customer booking flow has a time-of-day picker - see CLAUDE.md.
 */
export const SELECTABLE_UNITS: HiringUnit[] = ["day", "trip"];

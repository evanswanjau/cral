import type { CatalogVehicleSummary, Money } from "./catalog-api.js";

/**
 * Hiring cadence (owner's call, 2026-09-23) - mirrors
 * `apps/api/src/modules/vehicles/hiring-units.ts`.
 *
 * A pre-submit total is only shown where it can be honest: a `day` hire is
 * the daily rate times inclusive days, and a `trip` is a flat fee whatever
 * the dates. An `hour` listing can't be created yet (the API refuses it
 * until this flow has a time-of-day picker), so it gets no estimate. The
 * server always computes the real figure from its own stored rate.
 */

export const HIRING_UNIT_LABEL: Record<CatalogVehicleSummary["hiring_unit"], string> = {
  day: "day",
  hour: "hour",
  trip: "trip",
};

/** The rate that actually prices a booking for this listing - not always `daily_rate`. */
export function unitRate(car: Pick<CatalogVehicleSummary, "hiring_unit" | "daily_rate" | "hourly_rate" | "trip_rate">): Money {
  if (car.hiring_unit === "hour" && car.hourly_rate) return car.hourly_rate;
  if (car.hiring_unit === "trip" && car.trip_rate) return car.trip_rate;
  return car.daily_rate;
}

/** The pre-submit total in cents, or null where none can be honestly shown. */
export function quoteTotal(
  car: Pick<CatalogVehicleSummary, "hiring_unit" | "daily_rate" | "trip_rate">,
  days: number,
): number | null {
  if (car.hiring_unit === "trip") return car.trip_rate ? car.trip_rate.amount : null;
  if (car.hiring_unit === "day") return days > 0 ? car.daily_rate.amount * days : null;
  return null;
}

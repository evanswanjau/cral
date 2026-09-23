import type { CatalogVehicleSummary, Money } from "./catalog-api.js";

/**
 * Hiring cadence (owner's call, 2026-09-23) - mirrors
 * `apps/api/src/modules/vehicles/hiring-units.ts`. The booking pages here
 * only ever collected a date range (no time-of-day picker), which is a
 * real per-day UX - there is no honest way to turn that into an hour
 * count client-side, so an `hour`/`trip` listing shows its rate and unit
 * but skips the day-multiplied estimate rather than fabricating one. The
 * server computes the real total from the actual pickup/dropoff instants
 * once the request is sent (spec §2 - the client never recomputes a total
 * for display that the server didn't produce).
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

import type { BookingRow } from "../modules/bookings/db-types.js";

/**
 * A truck request's route and load (PR T2 of
 * `docs/plans/trucks-and-sales-agents.md`), shaped once for every reader -
 * the renter's trip, the merchant's booking and the Ops booking - so the
 * three can't describe the same booking differently. Both are null on any
 * booking that isn't for a truck.
 */
export function routeAndLoadOf(b: BookingRow) {
  return {
    route:
      b.route_from && b.route_from_county && b.route_to && b.route_to_county
        ? {
            from: b.route_from,
            from_county: b.route_from_county,
            to: b.route_to,
            to_county: b.route_to_county,
          }
        : null,
    cargo: b.cargo_description ? { description: b.cargo_description, kg: b.cargo_kg } : null,
  };
}

/** "Industrial Area, Nairobi" - the line `pickup_location` / `dropoff_location` carry for a truck. */
export function placeLine(address: string, county: string): string {
  return `${address}, ${county}`.slice(0, 300);
}

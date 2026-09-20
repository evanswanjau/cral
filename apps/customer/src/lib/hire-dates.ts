/**
 * Hire dates, reasoned about in Nairobi - never in the browser's own
 * timezone. A renter in Nairobi and a renter on a laptop still set to
 * London must see the same "earliest pickup" and be quoted the same
 * number of days, so every date rule here mirrors
 * `apps/api/src/lib/dates.ts` exactly. The server re-checks all of it; a
 * disagreement between the two shows up as a 422, not as a wrong price.
 */

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // EAT is UTC+3, no DST

/** The last Nairobi hour at which a hire may start - cars are back by six. */
export const HIRE_DAY_END_HOUR = 18;

/** Today's Nairobi calendar day as `YYYY-MM-DD`. */
export function nairobiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The earliest day a hire may start: today, or tomorrow once Nairobi has
 * passed six in the evening. This is the `min` on every pickup date
 * input, and `createBooking` rejects anything earlier.
 */
export function earliestPickupDay(now: Date = new Date()): string {
  const nairobi = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  if (nairobi.getUTCHours() >= HIRE_DAY_END_HOUR) {
    return new Date(nairobi.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  return nairobi.toISOString().slice(0, 10);
}

/** True once Nairobi is past the cutoff - the copy explaining why today is gone. */
export function isAfterHireCutoff(now: Date = new Date()): boolean {
  return new Date(now.getTime() + NAIROBI_OFFSET_MS).getUTCHours() >= HIRE_DAY_END_HOUR;
}

/**
 * Hire days, counted inclusively: the 19th to the 19th is one day, the
 * 19th to the 20th is two. Both arguments are `YYYY-MM-DD`.
 */
export function hireDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(1, Math.round((b - a) / (24 * 60 * 60 * 1000)) + 1);
}

/**
 * The two UTC instants a `YYYY-MM-DD` pair becomes on the wire: a hire
 * runs 09:00 to 18:00 Nairobi, so a same-day hire is a real hire and
 * every car is back by the hour the cutoff above protects.
 */
export function hireInstants(from: string, to: string): { pickup_at: string; dropoff_at: string } {
  return {
    pickup_at: new Date(Date.parse(`${from}T09:00:00.000Z`) - NAIROBI_OFFSET_MS).toISOString(),
    dropoff_at: new Date(
      Date.parse(`${to}T${String(HIRE_DAY_END_HOUR).padStart(2, "0")}:00:00.000Z`) - NAIROBI_OFFSET_MS,
    ).toISOString(),
  };
}

/** `15 Mar 2026`, for display. */
export function formatHireDate(day: string): string {
  if (!day) return "";
  return new Date(`${day}T12:00:00.000Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

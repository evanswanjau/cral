import { ApiError } from "@cral/types";

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // EAT is UTC+3, no DST

/**
 * The UTC instant at which the current Nairobi calendar day began — for
 * "decided today" style windows. Nairobi is display/day-boundary only
 * (spec §2); the stored timestamps stay UTC. `modules/dashboard` and
 * `modules/payouts` each carry their own copy of this arithmetic; this is
 * the shared home for new callers.
 */
export function nairobiDayStartUtc(instant: Date): Date {
  const day = new Date(instant.getTime() + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - NAIROBI_OFFSET_MS);
}

/**
 * The UTC instant at which the current Nairobi calendar month began —
 * "this month" style windows (e.g. Communications' "sent this month"
 * tile). Same reasoning as `nairobiDayStartUtc`: Nairobi is display/
 * boundary only, the stored timestamps stay UTC.
 */
export function nairobiMonthStartUtc(instant: Date): Date {
  const nairobiDate = new Date(instant.getTime() + NAIROBI_OFFSET_MS);
  const monthStart = `${nairobiDate.toISOString().slice(0, 7)}-01`;
  return new Date(Date.parse(`${monthStart}T00:00:00.000Z`) - NAIROBI_OFFSET_MS);
}

/**
 * Rejects a bare calendar date (`YYYY-MM-DD`) that is already in the past.
 * Document expiry dates can't be backdated — a typed-in date bypasses the
 * `min` attribute on the client's date input, so the server re-checks. The
 * comparison is on the calendar date, not the instant, so "today" always
 * passes regardless of timezone.
 */
export function assertNotPast(value: string, field: string): void {
  const today = new Date().toISOString().slice(0, 10);
  if (value.slice(0, 10) < today) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "expiry_in_past",
      message: "That date has already passed. Enter the current document's expiry date.",
      field,
    });
  }
}

/**
 * The Nairobi calendar day (`YYYY-MM-DD`) an instant falls on. Hire dates
 * are reasoned about as Nairobi *days*, never as elapsed milliseconds -
 * a hire is sold by the day, and a renter's "the 19th" means the 19th in
 * Nairobi whatever their device clock says.
 */
export function nairobiDayKey(instant: Date): string {
  return new Date(instant.getTime() + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The last Nairobi hour at which a hire may *start*. Cars have to be back
 * with their owner by close, so a hire that begins after this would be
 * handing keys over in the dark on its first day (owner's call,
 * 2026-09-19). Dropoffs are pinned to this hour too - see
 * `nairobiHireInstants`.
 */
export const HIRE_DAY_END_HOUR = 18;

/**
 * The earliest Nairobi day a hire may start, given "now". Today, unless
 * Nairobi has already passed `HIRE_DAY_END_HOUR`, in which case the
 * earliest pickup is tomorrow. Client date inputs use this for their
 * `min`; `createBooking` re-checks it, because a typed-in date bypasses
 * the attribute.
 */
export function earliestPickupDayKey(now: Date = new Date()): string {
  const nairobi = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  if (nairobi.getUTCHours() >= HIRE_DAY_END_HOUR) {
    return new Date(nairobi.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  return nairobi.toISOString().slice(0, 10);
}

/**
 * Hire days, counted inclusively: the 19th to the 19th is one day, the
 * 19th to the 20th is two (owner's call, 2026-09-19). This is what the
 * hire is *sold* in, so it is also what `computeBookingPricing` is handed
 * - the client quote and the stored price both derive from this one
 * function rather than each re-deriving it from milliseconds.
 */
export function inclusiveHireDays(pickup: Date, dropoff: Date): number {
  const from = Date.parse(`${nairobiDayKey(pickup)}T00:00:00.000Z`);
  const to = Date.parse(`${nairobiDayKey(dropoff)}T00:00:00.000Z`);
  return Math.max(1, Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1);
}

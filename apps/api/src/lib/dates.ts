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

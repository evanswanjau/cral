import { ApiError } from "@cral/types";

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

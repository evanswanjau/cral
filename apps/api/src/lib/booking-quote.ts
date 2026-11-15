import { kes, type Money } from "@cral/types";
import type { BookingRow } from "../modules/bookings/db-types.js";

/** How long a renter has to accept a quote (PR T3, client's call 2026-11-10). */
export const QUOTE_VALID_HOURS = 48;

/**
 * The merchant's quote on a booking (PR T3), shaped once for the renter,
 * merchant and Ops readers. Null until the merchant has priced it - a
 * `quote_requested` booking's money columns are all zero, and no reader
 * should show those zeros as a price.
 */
export function quoteOf(b: BookingRow) {
  if (!b.quoted_at) return null;
  return {
    amount: kes(b.gross_amount) as Money,
    note: b.quote_note,
    quoted_at: b.quoted_at.toISOString(),
    expires_at: b.quote_expires_at ? b.quote_expires_at.toISOString() : null,
  };
}

/** Statuses a booking passes through before it is confirmed - all of them "waiting on someone". */
export const OPEN_REQUEST_STATUSES = ["requested", "quote_requested", "quoted"] as const;

import { apiGet, apiPost } from "./api.js";
import type { Money } from "./catalog-api.js";

/**
 * Typed client for the renter's side of payment. `getPaymentState` is what
 * a *reloaded* page reads to find out where it actually got to - the
 * client never infers payment state from local state that a refresh
 * would throw away.
 */

export type PaymentStatus =
  | "none"
  | "pending"
  | "success"
  | "failed"
  | "cancelled"
  | "expired";

export interface PaymentState {
  status: PaymentStatus;
  amount: Money | null;
  phone: string | null;
  receipt: string | null;
  failure_reason: string | null;
  expires_at: string | null;
}

function idempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Sends the M-Pesa STK prompt for a booking the owner has accepted. */
export function payForBooking(bookingId: string, phone: string) {
  return apiPost<{ payment_request_id: string; status: string }>(
    `/bookings/${bookingId}/pay`,
    { purpose: "full", phone },
    { headers: { "Idempotency-Key": idempotencyKey() } },
  );
}

export function getPaymentState(bookingId: string) {
  return apiGet<PaymentState>(`/bookings/${bookingId}/payment`);
}

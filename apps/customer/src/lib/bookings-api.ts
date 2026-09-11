import { apiGet, apiPost } from "./api.js";
import type { Money } from "./catalog-api.js";

/** Typed client for `openapi/customer-bookings.yaml`. */

export interface BookingVehicle {
  id: string;
  make: string;
  model: string;
  year: string;
  category: string;
  registration: string;
  county: string | null;
  seats: number;
  transmission: string;
  chauffeured: boolean;
  primary_photo_url: string | null;
  owner_display_name: string;
}

export type BookingStatus =
  | "requested"
  | "confirmed"
  | "active"
  | "completed"
  | "declined"
  | "expired"
  | "cancelled";

export interface BookingSummary {
  id: string;
  ref: string;
  status: BookingStatus;
  pickup_at: string;
  dropoff_at: string;
  days: number;
  gross: Money;
  vehicle: BookingVehicle;
  created_at: string;
}

export interface BookingDetail extends BookingSummary {
  deposit: Money;
  total_due: Money;
  pickup_location: string;
  dropoff_location: string;
  note_from_hirer: string | null;
  response_due_at: string | null;
  decline_reason_code: string | null;
  cancel_reason: string | null;
}

export interface BookingsPage {
  data: BookingSummary[];
  next_cursor: string | null;
  has_more: boolean;
  counts: Record<string, number>;
}

function idempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createBooking(input: {
  vehicle_id: string;
  pickup_at: string;
  dropoff_at: string;
  note_from_hirer?: string;
}) {
  return apiPost<BookingDetail>("/bookings", input, {
    headers: { "Idempotency-Key": idempotencyKey() },
  });
}

export function listMyBookings(
  params: { filter?: string; cursor?: string; limit?: number } = {},
) {
  const q = new URLSearchParams();
  if (params.filter) q.set("filter", params.filter);
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiGet<BookingsPage>(`/bookings${qs ? `?${qs}` : ""}`);
}

export function getMyBooking(id: string) {
  return apiGet<BookingDetail>(`/bookings/${id}`);
}

export function cancelMyBooking(id: string, reason?: string) {
  return apiPost<BookingDetail>(
    `/bookings/${id}/cancel`,
    { reason },
    { headers: { "Idempotency-Key": idempotencyKey() } },
  );
}

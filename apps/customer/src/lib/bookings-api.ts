import { apiGet, apiPost } from "./api.js";
import type { Money } from "./catalog-api.js";
import type { DocumentState, RenterDocKind } from "./documents-api.js";

/** Typed client for `openapi/customer-bookings.yaml`. */

export interface BookingVehicle {
  id: string;
  make: string;
  model: string;
  year: string;
  category: "sedan" | "suv" | "van" | "truck" | "machinery";
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
  /** PR T3: waiting for the owner's price. */
  | "quote_requested"
  /** PR T3: priced - accept it to book. */
  | "quoted"
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
  /** Null on a driver-only booking - the renter's own car (docs/plans/drivers.md). */
  vehicle: BookingVehicle | null;
  /** The driver on this booking, if one was hired. */
  driver: BookingDriver | null;
  /** The driver's share of `gross`. */
  driver_amount: Money | null;
  driver_rate_unit: "day" | "hour" | "trip" | null;
  driver_rate_quantity: number | null;
  rate_unit: "day" | "hour" | "trip";
  rate_quantity: number;
  /** Driver-only: the car the driver is coming to drive. */
  hire_car_details: string | null;
  created_at: string;
}

/** The owner's price for a quote request (PR T3). */
export interface BookingQuote {
  amount: Money;
  note: string | null;
  quoted_at: string;
  expires_at: string | null;
}

/** Take the owner's price (PR T3) - the booking is confirmed and goes on to payment. */
export function acceptQuote(id: string) {
  return apiPost<BookingDetail>(`/bookings/${id}/accept-quote`, undefined, {
    headers: { "Idempotency-Key": idempotencyKey() },
  });
}

/** Enter the code a driver read out - a driver-only job starts (DR4). */
export function enterDriverCode(id: string, code: string) {
  return apiPost<BookingDetail>(`/bookings/${id}/driver-code`, { code }, {
    headers: { "Idempotency-Key": idempotencyKey() },
  });
}

/** Where a truck collects the load and where it goes (PR T2). */
export interface BookingRoute {
  from: string;
  from_county: string;
  to: string;
  to_county: string;
}

/** What a truck is moving; `kg` only when the renter gave a weight. */
export interface BookingCargo {
  description: string;
  kg: number | null;
}

/** The extra fields a truck request sends - required for a truck, refused for anything else. */
export interface TruckRequestFields {
  route_from: string;
  route_from_county: string;
  route_to: string;
  route_to_county: string;
  cargo_description: string;
  cargo_kg: number | null;
}

export interface BookingDriver {
  id: string;
  /** The driver's full name. */
  display_name: string;
  merchant_name: string;
}

/** The owner a renter deals with - a car's owner, or who a driver drives for. */
export function ownerName(b: Pick<BookingSummary, "vehicle" | "driver">): string {
  return b.vehicle?.owner_display_name ?? b.driver?.merchant_name ?? "the owner";
}

/** "Toyota Prado 2020", "Toyota Prado 2020 with Peter K.", or "Driver Peter K.". */
export function bookingTitle(b: Pick<BookingSummary, "vehicle" | "driver">): string {
  if (!b.vehicle) return `Driver ${b.driver?.display_name ?? ""}`.trim();
  const car = `${b.vehicle.make} ${b.vehicle.model} ${b.vehicle.year}`;
  return b.driver ? `${car} with ${b.driver.display_name}` : car;
}

export type HandoverKind = "pickup" | "return";
export type HandoverState =
  | "otp_sent"
  | "otp_verified"
  | "condition_logged"
  | "confirmed"
  | "completed"
  | "expired"
  | "failed";

/**
 * The renter's own view of a handover - never the code itself, only its
 * state (see openapi/customer-bookings.yaml's own note). Newest first.
 */
export interface HandoverStatus {
  kind: HandoverKind;
  state: HandoverState;
  /** `driver`: texted to the driver, who reads it to you, and you enter it here (DR4). `hirer`: emailed to you. */
  code_holder: "hirer" | "driver";
  masked_destination: string | null;
  otp_expires_at: string | null;
  completed_at: string | null;
}

export interface BookingDetail extends BookingSummary {
  deposit: Money;
  total_due: Money;
  pickup_location: string;
  dropoff_location: string;
  /** Truck requests only (PR T2) - null on every other booking. */
  route: BookingRoute | null;
  cargo: BookingCargo | null;
  /** The owner's price on a quoted booking (PR T3); null until they send it. */
  quote: BookingQuote | null;
  note_from_hirer: string | null;
  response_due_at: string | null;
  decline_reason_code: string | null;
  cancel_reason: string | null;
  handovers: HandoverStatus[];
  /** The other half of a car + another owner's driver request - accepted and paid on its own. */
  linked_booking: { id: string; ref: string; status: BookingStatus; gross: Money } | null;
  /**
   * The renter's papers this hire needs (H5): the ID always, the licence
   * only for self-drive. Pay is refused until `cleared`.
   */
  documents: {
    cleared: boolean;
    items: { kind: RenterDocKind; state: DocumentState; review_note: string | null }[];
  };
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
  vehicle_id?: string;
  driver_id?: string;
  driver_unit?: "day" | "hour" | "trip";
  hire_car_details?: string;
  pickup_at: string;
  dropoff_at: string;
  note_from_hirer?: string;
} & Partial<TruckRequestFields>) {
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

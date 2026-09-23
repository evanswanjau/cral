/**
 * Row shape for `service_requests` — the "Services" umbrella's first real
 * offering, towing/recovery (owner's call, 2026-09-23). See the migration
 * for why this is its own table rather than a `bookings` row.
 */

export type ServiceRequestReason = "mechanical_breakdown" | "accident";

export type ServiceRequestStatus =
  | "requested"
  | "quoted"
  | "accepted"
  | "declined"
  | "completed"
  | "cancelled";

export interface ServiceRequestRow {
  id: string;
  user_id: string;
  reason: ServiceRequestReason;
  pickup_location: string;
  destination_location: string | null;
  contact_phone: string;
  description: string | null;
  distance_km: string | null; // knex returns DECIMAL as a string
  quoted_amount: number | null;
  quoted_currency: string | null;
  quote_note: string | null;
  quoted_by: string | null;
  quoted_at: Date | null;
  status: ServiceRequestStatus;
  decline_reason: string | null;
  cancel_reason: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

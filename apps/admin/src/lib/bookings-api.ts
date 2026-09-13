import { apiGet } from "./api.js";

export type AdminBookingStatus =
  | "requested"
  | "confirmed"
  | "active"
  | "completed"
  | "declined"
  | "expired"
  | "cancelled";

interface Money {
  amount: number;
  currency: string;
}

export interface AdminBookingSummary {
  id: string;
  ref: string;
  status: AdminBookingStatus;
  pickup_at: string;
  dropoff_at: string;
  gross: Money;
  hirer_name: string;
  merchant_name: string;
  vehicle_label: string;
  created_at: string;
}

export interface AdminBookingsResponse {
  data: AdminBookingSummary[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface AdminBookingDetail extends AdminBookingSummary {
  hirer_id: string;
  hirer_email: string;
  hirer_id_verified: boolean;
  merchant_id: string;
  vehicle_id: string;
  pickup_location: string;
  dropoff_location: string;
  note_from_hirer: string | null;
  commission: Money;
  merchant_net: Money;
  payment_status: "none" | "pending" | "success" | "failed" | "cancelled";
  response_due_at: string | null;
  decline_reason_code: string | null;
  cancel_reason: string | null;
  returned_at: string | null;
}

export function fetchBookings(params: { status?: string; cursor?: string } = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  return apiGet<AdminBookingsResponse>(`/admin/bookings${qs ? `?${qs}` : ""}`);
}

export function fetchBookingDetail(id: string) {
  return apiGet<AdminBookingDetail>(`/admin/bookings/${id}`);
}

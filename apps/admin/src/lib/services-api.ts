import { apiGet, apiPost } from "./api.js";

export type ServiceRequestReason = "mechanical_breakdown" | "accident";
export type ServiceRequestStatus = "requested" | "quoted" | "accepted" | "declined" | "completed" | "cancelled";

export interface Money {
  amount: number;
  currency: string;
}

export interface ServiceRequestQueueRow {
  id: string;
  reason: ServiceRequestReason;
  status: ServiceRequestStatus;
  pickup_location: string;
  destination_location: string | null;
  requester_name: string | null;
  requester_email: string;
  distance_km: number | null;
  quoted_amount: Money | null;
  created_at: string;
}

export interface ServiceRequestCase extends ServiceRequestQueueRow {
  contact_phone: string;
  description: string | null;
  quote_note: string | null;
  quoted_at: string | null;
  decline_reason: string | null;
  cancel_reason: string | null;
}

export interface ServiceRequestsResponse {
  data: ServiceRequestQueueRow[];
  next_cursor: string | null;
  has_more: boolean;
}

export function fetchServiceRequests(params: { status?: string } = {}) {
  const q = new URLSearchParams();
  if (params.status && params.status !== "open") q.set("status", params.status);
  const qs = q.toString();
  return apiGet<ServiceRequestsResponse>(`/admin/service-requests${qs ? `?${qs}` : ""}`);
}

export function fetchServiceRequestCase(id: string) {
  return apiGet<ServiceRequestCase>(`/admin/service-requests/${id}`);
}

export function quoteServiceRequest(
  id: string,
  input: { distance_km?: number | null; amount_cents?: number | null; note?: string | null },
) {
  return apiPost<ServiceRequestCase>(`/admin/service-requests/${id}/quote`, input);
}

export function declineServiceRequest(id: string, reason: string) {
  return apiPost<ServiceRequestCase>(`/admin/service-requests/${id}/decline`, { reason });
}

export function completeServiceRequest(id: string) {
  return apiPost<ServiceRequestCase>(`/admin/service-requests/${id}/complete`, {});
}

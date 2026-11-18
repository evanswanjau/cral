import { apiGet, apiPost } from "./api.js";
import type { Money } from "./catalog-api.js";

/**
 * Towing requests (docs/decisions/services.md,
 * `openapi/customer-services.yaml`), moved out of the old `Towing.tsx`
 * page (UI3). Lead capture: CRAL quotes by hand, no payment step here.
 */

export type TowReason = "mechanical_breakdown" | "accident";

export interface ServiceRequest {
  id: string;
  reason: TowReason;
  pickup_location: string;
  destination_location: string | null;
  status: "requested" | "quoted" | "accepted" | "declined" | "completed" | "cancelled";
  quoted_amount: Money | null;
  quote_note: string | null;
  decline_reason: string | null;
  created_at: string;
}

export interface TowRequestInput {
  reason: TowReason;
  pickup_location: string;
  destination_location: string | null;
  contact_phone: string;
  description: string | null;
}

export const REASON_LABEL: Record<TowReason, string> = {
  mechanical_breakdown: "Mechanical breakdown",
  accident: "Accident",
};

export function requestTow(input: TowRequestInput) {
  return apiPost<ServiceRequest>("/services/towing", input);
}

export function listMyServiceRequests() {
  return apiGet<{ data: ServiceRequest[] }>("/me/service-requests");
}

export function acceptServiceQuote(id: string) {
  return apiPost(`/me/service-requests/${id}/accept`);
}

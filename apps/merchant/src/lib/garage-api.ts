import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api.js";
import type { Money } from "./vehicles-api.js";

/**
 * Quote requests sent to this merchant's garages, and the itemised quotes
 * sent back (Phase 4 GS2, openapi/merchant-garage.yaml). Take-home comes
 * from the API in shillings; the fee rate never reaches this app.
 */

export type LineKind = "part" | "labour" | "delivery" | "other";
export type GarageFilter = "to_quote" | "quoted" | "closed" | "all";

export const LINE_KINDS: LineKind[] = ["part", "labour", "delivery", "other"];
export const LINE_LABELS: Record<LineKind, string> = { part: "Part", labour: "Labour", delivery: "Delivery", other: "Other" };

export const SERVICE_LABELS: Record<string, string> = {
  service: "Servicing",
  diagnostics: "Diagnostics",
  mechanical: "Mechanical repair",
  bodywork: "Bodywork and paint",
  tyres: "Tyres and alignment",
  electrical: "Electrical",
  ac: "Air conditioning",
};

// --- PT1: spare parts (docs/decisions/parts.md) -------------------------

export type RequestKind = "service" | "part";
export type PartCondition = "genuine" | "oem" | "used";
export type Fulfilment = "fitted" | "delivered";
export const CONDITIONS: PartCondition[] = ["genuine", "oem", "used"];
export const CONDITION_LABELS: Record<PartCondition, string> = { genuine: "Genuine", oem: "OEM", used: "Used" };
export const FULFILMENT_LABELS: Record<Fulfilment, string> = {
  fitted: "We fit it at our premises",
  delivered: "We deliver it",
};

/** What a request is for: the garage service, or the part. */
export function requestTitle(r: { kind: RequestKind; service_type: string | null; part_name: string | null }): string {
  if (r.kind === "part") return r.part_name ?? "A part";
  return r.service_type ? (SERVICE_LABELS[r.service_type] ?? r.service_type) : "Garage work";
}

export interface QuoteLineInput {
  kind: LineKind;
  description: string;
  /** cents */
  amount: number;
}

export interface MyQuote {
  id: string;
  status: "sent" | "withdrawn" | "accepted" | "superseded";
  /** Set once the customer accepted this quote (GS3). */
  order_id: string | null;
  lines: Array<{ kind: LineKind; description: string; amount: Money }>;
  total: Money;
  take_home: Money;
  days_needed: number;
  part_condition: PartCondition | null;
  fulfilment: Fulfilment | null;
  note: string | null;
  sent_at: string;
  valid_until: string;
  expired: boolean;
}

export interface GarageRequest {
  id: string;
  kind: RequestKind;
  outlet: { id: string; name: string } | null;
  car: { make: string; model: string; year: number; plate: string; chassis_number: string | null } | null;
  service_type: string | null;
  part_name: string | null;
  /** Parts only: where the customer wants it delivered. */
  delivery_address: string | null;
  description: string;
  county: string;
  customer_first_name: string | null;
  status: "open" | "cancelled" | "accepted";
  declined: boolean;
  my_quote: MyQuote | null;
  created_at: string;
}

export const kesText = (m: Money) => `KES ${(m.amount / 100).toLocaleString("en-KE")}`;

export function useGarageRequests(filter: GarageFilter, enabled = true) {
  return useQuery({
    queryKey: ["garage-requests", filter],
    queryFn: () => apiGet<{ data: GarageRequest[]; counts: { to_quote: number } }>(`/merchant/garage-requests?filter=${filter}&limit=100`),
    enabled,
  });
}

export function useGarageRequest(id: string | undefined) {
  return useQuery({
    queryKey: ["garage-request", id],
    queryFn: () => apiGet<GarageRequest>(`/merchant/garage-requests/${id}`),
    enabled: !!id,
  });
}

export const previewQuote = (lines: QuoteLineInput[], kind: RequestKind = "service") =>
  apiPost<{ total: Money; take_home: Money }>("/merchant/garage-requests/quote-preview", { lines, kind });

function useAction<T>(id: string, fn: (input: T) => Promise<GarageRequest>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.setQueryData(["garage-request", id], r);
      void qc.invalidateQueries({ queryKey: ["garage-requests"] });
    },
  });
}

export const useSendQuote = (id: string) =>
  useAction(id, (input: { lines: QuoteLineInput[]; days_needed: number; note: string | null; part_condition?: PartCondition; fulfilment?: Fulfilment }) =>
    apiPost<GarageRequest>(`/merchant/garage-requests/${id}/quote`, input),
  );
export const useWithdrawQuote = (id: string) => useAction(id, () => apiPost<GarageRequest>(`/merchant/garage-requests/${id}/quote/withdraw`));
export const useDeclineRequest = (id: string) => useAction(id, () => apiPost<GarageRequest>(`/merchant/garage-requests/${id}/decline`));

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api.js";
import type { Money } from "./vehicles-api.js";
import type { LineKind, QuoteLineInput } from "./garage-api.js";

/**
 * Garage jobs (Phase 4 GS3, openapi/merchant-garage.yaml). The customer
 * pays CRAL; the garage starts once paid, may send one extra-work quote at
 * a time, marks the car ready, and is paid in its payout run once the
 * customer confirms. Shilling amounts only: what the customer paid and
 * what the garage keeps. CRAL's fee rate never reaches this app.
 */

export type OrderStatus =
  | "awaiting_payment"
  | "paid"
  | "in_progress"
  | "ready"
  | "completed"
  | "problem"
  | "cancelled"
  | "refunded";

export type OrderFilter = "active" | "done" | "all";

export interface OrderQuote {
  id: string;
  kind: "original" | "extra";
  status: "sent" | "withdrawn" | "accepted" | "superseded" | "declined";
  lines: Array<{ kind: LineKind; description: string; amount: Money }>;
  total: Money;
  take_home: Money;
  days_needed: number;
  note: string | null;
  sent_at: string;
  valid_until: string;
  expired: boolean;
  accepted_at: string | null;
  paid_at: string | null;
}

export interface GarageOrder {
  id: string;
  ref: string;
  status: OrderStatus;
  request_id: string;
  service_type: string | null;
  description: string | null;
  car: { make: string; model: string; year: number; plate: string } | null;
  outlet: { id: string; name: string; address: string; county: string } | null;
  customer_first_name: string | null;
  quotes: OrderQuote[];
  total: Money;
  take_home: Money;
  amount_due: Money | null;
  due_quote_id: string | null;
  paid_at: string | null;
  started_at: string | null;
  ready_at: string | null;
  auto_confirm_at: string | null;
  completed_at: string | null;
  confirmed_by: "customer" | "auto" | "ops" | null;
  problem_raised_at: string | null;
  problem_note: string | null;
  resolution_note: string | null;
  created_at: string;
}

/** Status in words, with a colour that is never the only signal. */
export const ORDER_STATUS: Record<OrderStatus, { label: string; color: string }> = {
  awaiting_payment: { label: "Waiting for payment", color: "#5A6373" },
  paid: { label: "Paid, start the work", color: "#8A5200" },
  in_progress: { label: "In progress", color: "#0F23A8" },
  ready: { label: "Ready, waiting on customer", color: "#0F23A8" },
  completed: { label: "Done, joins your payout", color: "#076945" },
  problem: { label: "Problem raised", color: "#A50E22" },
  cancelled: { label: "Cancelled", color: "#5A6373" },
  refunded: { label: "Refunded to customer", color: "#5A6373" },
};

export function useGarageOrders(filter: OrderFilter, enabled = true) {
  return useQuery({
    queryKey: ["garage-orders", filter],
    queryFn: () => apiGet<{ data: GarageOrder[]; counts: { to_start: number } }>(`/merchant/garage-orders?filter=${filter}&limit=100`),
    enabled,
  });
}

export function useGarageOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["garage-order", id],
    queryFn: () => apiGet<GarageOrder>(`/merchant/garage-orders/${id}`),
    enabled: !!id,
  });
}

function useOrderAction<T>(id: string, fn: (input: T) => Promise<GarageOrder>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (o) => {
      qc.setQueryData(["garage-order", id], o);
      void qc.invalidateQueries({ queryKey: ["garage-orders"] });
    },
  });
}

export const useStartOrder = (id: string) => useOrderAction(id, () => apiPost<GarageOrder>(`/merchant/garage-orders/${id}/start`));
export const useMarkReady = (id: string) => useOrderAction(id, () => apiPost<GarageOrder>(`/merchant/garage-orders/${id}/ready`));
export const useSendExtra = (id: string) =>
  useOrderAction(id, (input: { lines: QuoteLineInput[]; days_needed: number; note: string | null }) =>
    apiPost<GarageOrder>(`/merchant/garage-orders/${id}/extras`, input),
  );
export const useWithdrawExtra = (id: string) =>
  useOrderAction(id, (quoteId: string) => apiPost<GarageOrder>(`/merchant/garage-orders/${id}/extras/${quoteId}/withdraw`));

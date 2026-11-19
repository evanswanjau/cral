import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api.js";
import type { Money } from "./vehicles-api.js";
import type { Fulfilment, LineKind, PartCondition, QuoteLineInput, RequestKind } from "./garage-api.js";

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
  part_condition: PartCondition | null;
  fulfilment: Fulfilment | null;
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
  kind: RequestKind;
  request_id: string;
  service_type: string | null;
  /** Parts orders (PT1): the part, its condition, fitted or delivered, and where. */
  part_name: string | null;
  part_condition: PartCondition | null;
  fulfilment: Fulfilment | null;
  delivery_address: string | null;
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

/** A part order's status in words (PT1); the rest read as a garage job's. */
export function orderStatus(o: Pick<GarageOrder, "kind" | "status" | "fulfilment">): { label: string; color: string } {
  if (o.kind !== "part") return ORDER_STATUS[o.status];
  if (o.status === "paid") return { label: o.fulfilment === "fitted" ? "Paid, fit the part" : "Paid, deliver the part", color: "#8A5200" };
  if (o.status === "in_progress") return { label: "Getting it ready", color: "#0F23A8" };
  if (o.status === "ready") return { label: `${o.fulfilment === "fitted" ? "Fitted" : "Delivered"}, waiting on customer`, color: "#0F23A8" };
  if (o.status === "problem") return { label: "Customer says wrong part", color: "#A50E22" };
  return ORDER_STATUS[o.status];
}

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

/** One of this garage's own completed jobs on a car (GS4's service record, garage side). */
export interface ServiceRecordEntry {
  order_id: string;
  ref: string;
  service_type: string | null;
  part_name: string | null;
  description: string | null;
  outlet_name: string | null;
  lines: Array<{ kind: LineKind; description: string; amount: Money }>;
  total: Money;
  take_home: Money;
  completed_at: string;
}

/** Your own finished jobs on this job's car, latest first. Never another garage's. */
export function useServiceRecord(orderId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["garage-order", orderId, "service-record"],
    queryFn: ({ pageParam }) =>
      apiGet<{ data: ServiceRecordEntry[]; next_cursor: string | null; has_more: boolean }>(
        `/merchant/garage-orders/${orderId}/service-record?limit=10${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : null),
    enabled: !!orderId,
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

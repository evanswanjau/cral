import { apiGet, apiPost } from "./api.js";

/**
 * Garage jobs for Ops (Phase 4 GS3 API, GS4 console):
 * openapi/admin-garage-orders.yaml. `admin_support` and `admin_finance`
 * (and `admin_super`) only. Ops sees CRAL's commission and the customer's
 * phone; the merchant portal never does.
 */

export interface Money {
  amount: number;
  currency: string;
}

export type GarageOrderStatus =
  | "awaiting_payment"
  | "paid"
  | "in_progress"
  | "ready"
  | "completed"
  | "problem"
  | "cancelled"
  | "refunded";

export interface AdminOrderQuote {
  id: string;
  kind: "original" | "extra";
  status: "sent" | "withdrawn" | "accepted" | "superseded" | "declined";
  lines: Array<{ kind: string; description: string; amount: Money }>;
  total: Money;
  commission: Money | null;
  days_needed: number;
  note: string | null;
  sent_at: string;
  valid_until: string;
  expired: boolean;
  accepted_at: string | null;
  paid_at: string | null;
}

export interface AdminGarageOrder {
  id: string;
  ref: string;
  status: GarageOrderStatus;
  request_id: string;
  service_type: string | null;
  description: string | null;
  car: { make: string; model: string; year: number; plate: string } | null;
  outlet: { id: string; name: string; address: string; county: string } | null;
  customer_first_name: string | null;
  customer_phone: string | null;
  merchant_id: string;
  quotes: AdminOrderQuote[];
  total: Money;
  commission: Money;
  merchant_net: Money;
  amount_due: Money | null;
  payment: { status: string; quote_id: string | null; amount: Money; receipt: string | null; failure_reason: string | null } | null;
  paid_at: string | null;
  started_at: string | null;
  ready_at: string | null;
  auto_confirm_at: string | null;
  completed_at: string | null;
  confirmed_by: "customer" | "auto" | "ops" | null;
  cancelled_at: string | null;
  problem_raised_at: string | null;
  problem_note: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface GarageOrdersPage {
  data: AdminGarageOrder[];
  next_cursor: string | null;
  has_more: boolean;
}

export function fetchGarageOrders(status: GarageOrderStatus | "all", cursor?: string | null) {
  const q = new URLSearchParams({ limit: "25" });
  if (status !== "all") q.set("status", status);
  if (cursor) q.set("cursor", cursor);
  return apiGet<GarageOrdersPage>(`/admin/garage-orders?${q.toString()}`);
}

export function fetchGarageOrder(id: string) {
  return apiGet<AdminGarageOrder>(`/admin/garage-orders/${id}`);
}

/** Settle a problem: `release` pays the garage in its next run, `refund` sends every payment back. */
export function resolveGarageOrder(id: string, input: { outcome: "release" | "refund"; note: string }) {
  return apiPost<AdminGarageOrder>(`/admin/garage-orders/${id}/resolve`, input, {
    headers: { "Idempotency-Key": `adm-${crypto.randomUUID()}` },
  });
}

export const SERVICE_LABELS: Record<string, string> = {
  service: "Servicing",
  diagnostics: "Diagnostics",
  mechanical: "Mechanical repair",
  bodywork: "Bodywork and paint",
  tyres: "Tyres and alignment",
  electrical: "Electrical",
  ac: "Air conditioning",
};

/** Status word plus colour; the word always carries the meaning, never the colour alone. */
export const ORDER_STATUS: Record<GarageOrderStatus, { label: string; bg: string; border: string; fg: string }> = {
  problem: { label: "PROBLEM RAISED", bg: "#FDE7EA", border: "#F7BDC5", fg: "#A50E22" },
  awaiting_payment: { label: "AWAITING PAYMENT", bg: "#FFF3DB", border: "#F5D9A3", fg: "#8A5200" },
  paid: { label: "PAID, NOT STARTED", bg: "#EDEFFC", border: "#C3CBF5", fg: "#0F23A8" },
  in_progress: { label: "IN PROGRESS", bg: "#EDEFFC", border: "#C3CBF5", fg: "#0F23A8" },
  ready: { label: "READY, AWAITING CONFIRM", bg: "#EDEFFC", border: "#C3CBF5", fg: "#0F23A8" },
  completed: { label: "COMPLETED", bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" },
  refunded: { label: "REFUNDED", bg: "#F1F3F6", border: "#E4E7EC", fg: "#5A6373" },
  cancelled: { label: "CANCELLED", bg: "#F1F3F6", border: "#E4E7EC", fg: "#838C9B" },
};

export const money = (m: Money) => `KES ${(m.amount / 100).toLocaleString("en-KE")}`;

import { apiDelete, apiGet, apiPatch, apiPost } from "./api.js";
import type { Money } from "./catalog-api.js";

/**
 * "My cars" and garage quote requests (Phase 4 GS2,
 * `openapi/customer-garage.yaml`) and orders (GS3): accepting a quote,
 * paying CRAL by M-Pesa, extra-work quotes, confirming the job.
 */

export type ServiceType = "service" | "diagnostics" | "mechanical" | "bodywork" | "tyres" | "electrical" | "ac";

export const SERVICE_TYPES: ServiceType[] = ["service", "diagnostics", "mechanical", "bodywork", "tyres", "electrical", "ac"];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  service: "Servicing",
  diagnostics: "Diagnostics",
  mechanical: "Mechanical repair",
  bodywork: "Bodywork and paint",
  tyres: "Tyres and alignment",
  electrical: "Electrical",
  ac: "Air conditioning",
};

export const LINE_LABELS: Record<string, string> = { part: "Part", labour: "Labour", delivery: "Delivery", other: "Other" };

// --- PT1: spare parts (docs/decisions/parts.md) -------------------------

export type RequestKind = "service" | "part";
export type PartCondition = "genuine" | "oem" | "used";
export type Fulfilment = "fitted" | "delivered";

export const CONDITION_LABELS: Record<PartCondition, string> = { genuine: "Genuine", oem: "OEM", used: "Used" };
export const FULFILMENT_LABELS: Record<Fulfilment, string> = {
  fitted: "Fitted at the dealer",
  delivered: "Delivered to you",
};

export interface CarInput {
  make: string;
  model: string;
  year: number;
  plate: string;
  chassis_number: string | null;
}

export interface Car extends CarInput {
  id: string;
  created_at: string;
}

export interface GarageQuote {
  id: string;
  outlet: { id: string; name: string; county: string; address: string; visited_on: string | null } | null;
  lines: Array<{ kind: string; description: string; amount: Money }>;
  total: Money;
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
  car: Car | null;
  /** Null on a parts request. */
  service_type: ServiceType | null;
  part_name: string | null;
  delivery_address: string | null;
  description: string;
  county: string;
  status: "open" | "cancelled" | "accepted";
  garages_asked: number;
  garages_declined: number;
  quote_count: number;
  order: { id: string; ref: string; status: OrderStatus } | null;
  quotes?: GarageQuote[];
  created_at: string;
}

export interface GarageRequestInput {
  car_id: string;
  service_type: ServiceType;
  description: string;
  county: string;
}

export const listCars = () => apiGet<{ data: Car[] }>("/me/cars?limit=100");
export const createCar = (input: CarInput) => apiPost<Car>("/me/cars", input);
export const updateCar = (id: string, input: CarInput) => apiPatch<Car>(`/me/cars/${id}`, input);
export const deleteCar = (id: string) => apiDelete<void>(`/me/cars/${id}`);

export const listGarageRequests = (kind: RequestKind = "service") =>
  apiGet<{ data: GarageRequest[] }>(`/me/garage-requests?limit=50&kind=${kind}`);
export const getGarageRequest = (id: string) => apiGet<GarageRequest>(`/me/garage-requests/${id}`);
export const createGarageRequest = (input: GarageRequestInput) => apiPost<GarageRequest>("/me/garage-requests", input);
export const cancelGarageRequest = (id: string) => apiPost<GarageRequest>(`/me/garage-requests/${id}/cancel`);

export interface PartsRequestInput {
  car_id: string;
  part_name: string;
  description: string;
  county: string;
  delivery_address: string;
}
export const createPartsRequest = (input: PartsRequestInput) => apiPost<GarageRequest>("/me/parts-requests", input);

/** What a request is for, in words: the part, or the garage service. */
export function requestTitle(r: Pick<GarageRequest, "kind" | "service_type" | "part_name">): string {
  if (r.kind === "part") return r.part_name ?? "A part";
  return r.service_type ? SERVICE_LABELS[r.service_type] : "Garage work";
}

export function kesText(m: Money): string {
  return `KES ${(m.amount / 100).toLocaleString("en-KE")}`;
}

export function carName(c: Pick<Car, "year" | "make" | "model">): string {
  return `${c.year} ${c.make} ${c.model}`;
}

// --- GS3: orders -------------------------------------------------------

export type OrderStatus =
  | "awaiting_payment"
  | "paid"
  | "in_progress"
  | "ready"
  | "completed"
  | "problem"
  | "cancelled"
  | "refunded";

export interface OrderQuote {
  id: string;
  kind: "original" | "extra";
  status: "sent" | "withdrawn" | "accepted" | "superseded" | "declined";
  lines: Array<{ kind: string; description: string; amount: Money }>;
  total: Money;
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
  service_type: ServiceType | null;
  part_name: string | null;
  part_condition: PartCondition | null;
  fulfilment: Fulfilment | null;
  delivery_address: string | null;
  description: string | null;
  car: { make: string; model: string; year: number; plate: string } | null;
  outlet: { id: string; name: string; address: string; county: string } | null;
  quotes: OrderQuote[];
  total: Money;
  amount_due: Money | null;
  due_quote_id: string | null;
  payment: {
    status: "pending" | "success" | "failed" | "cancelled" | "expired";
    quote_id: string | null;
    amount: Money;
    receipt: string | null;
    failure_reason: string | null;
  } | null;
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

/** Status in words; never by colour alone. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "Waiting for your payment",
  paid: "Paid, waiting for the garage to start",
  in_progress: "Work in progress",
  ready: "Ready to collect",
  completed: "Done",
  problem: "Problem raised, CRAL is on it",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** A part order's status in words (PT1). */
export function orderStatusLabel(o: Pick<GarageOrder, "kind" | "status" | "fulfilment">): string {
  if (o.kind !== "part") return ORDER_STATUS_LABELS[o.status];
  switch (o.status) {
    case "paid":
      return "Paid, waiting for the dealer";
    case "in_progress":
      return "The dealer is getting it ready";
    case "ready":
      return o.fulfilment === "fitted" ? "Fitted, check it's the right part" : "Delivered, check it's the right part";
    case "problem":
      return "Wrong part reported, CRAL is on it";
    default:
      return ORDER_STATUS_LABELS[o.status];
  }
}

function idempotent() {
  return { headers: { "Idempotency-Key": `${Date.now()}-${Math.random().toString(36).slice(2)}` } };
}

export const acceptQuote = (requestId: string, quoteId: string) =>
  apiPost<GarageOrder>(`/me/garage-requests/${requestId}/quotes/${quoteId}/accept`, undefined, idempotent());
export const listGarageOrders = (kind: RequestKind = "service") =>
  apiGet<{ data: GarageOrder[] }>(`/me/garage-orders?limit=50&kind=${kind}`);
export const getGarageOrder = (id: string) => apiGet<GarageOrder>(`/me/garage-orders/${id}`);
export const payGarageOrder = (id: string, phone: string) =>
  apiPost<{ payment_request_id: string; status: string }>(`/me/garage-orders/${id}/pay`, { phone }, idempotent());
export const cancelGarageOrder = (id: string) => apiPost<GarageOrder>(`/me/garage-orders/${id}/cancel`, undefined, idempotent());
export const acceptExtraQuote = (id: string, quoteId: string) =>
  apiPost<GarageOrder>(`/me/garage-orders/${id}/extras/${quoteId}/accept`, undefined, idempotent());
export const declineExtraQuote = (id: string, quoteId: string) =>
  apiPost<GarageOrder>(`/me/garage-orders/${id}/extras/${quoteId}/decline`);
export const confirmGarageOrder = (id: string) => apiPost<GarageOrder>(`/me/garage-orders/${id}/confirm`, undefined, idempotent());
export const raiseGarageProblem = (id: string, note: string) => apiPost<GarageOrder>(`/me/garage-orders/${id}/problem`, { note });

// --- GS4: the service record ------------------------------------------

export interface ServiceRecordEntry {
  order_id: string;
  ref: string;
  service_type: ServiceType | null;
  part_name: string | null;
  description: string | null;
  outlet: { name: string; address: string; county: string } | null;
  /** The paid quotes: the original first, then any extra work. */
  work: Array<{ kind: "original" | "extra"; lines: Array<{ kind: string; description: string; amount: Money }>; total: Money }>;
  total: Money;
  paid_at: string | null;
  completed_at: string;
  confirmed_by: "customer" | "auto" | "ops";
}

export interface ServiceRecordPage {
  car: Car;
  data: ServiceRecordEntry[];
  next_cursor: string | null;
  has_more: boolean;
}

export const getServiceRecord = (carId: string, cursor?: string | null) =>
  apiGet<ServiceRecordPage>(`/me/cars/${carId}/service-record?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);

import { apiGet, apiPost } from "./api.js";

/** Car-sale review - openapi/admin-sales.yaml. */

export type SaleStatus =
  | "pending"
  | "review"
  | "action"
  | "rejected"
  | "live"
  | "paused"
  | "under_offer"
  | "sold"
  | "withdrawn"
  | "expired"
  | "removed";
export type SaleQueueFilter = "open" | "changes_sent" | "listed" | "reported" | "closed" | "all";

export interface Money {
  amount: number;
  currency: string;
}

export function kes(m: Money): string {
  return `KES ${Math.round(m.amount / 100).toLocaleString("en-KE")}`;
}

export interface SaleQueueRow {
  id: string;
  ref: string | null;
  title: string;
  registration: string;
  status: SaleStatus;
  asking_price: Money;
  county: string;
  seller_type: "merchant" | "private";
  seller_name: string;
  open_reports: number;
  submitted_at: string | null;
}

export interface DocLine {
  document_id: string;
  original_name: string;
  content_type: string;
  state: "pending" | "ok" | "expiring" | "rejected";
  review_note: string | null;
}

export interface CheckItem {
  id: string;
  section: "logbook" | "photos" | "listing";
  label: string;
  result: "pending" | "pass" | "flag";
  note: string | null;
}

export interface SaleCase {
  id: string;
  ref: string | null;
  title: string;
  status: SaleStatus;
  vehicle_id: string | null;
  car: {
    category: string;
    make: string;
    model: string;
    year: number;
    registration: string;
    chassis_number: string;
    mileage_km: number;
    engine_cc: number | null;
    transmission: string;
    fuel: string;
    colour: string | null;
    drive: string | null;
    import_status: string;
  };
  asking_price: Money;
  negotiable: boolean;
  disclosures: {
    known_faults: string;
    accident_history: string;
    accident_note: string | null;
    encumbered: boolean;
    service_history: string;
  };
  county: string;
  viewing_area: string;
  description: string | null;
  reviewer_note: string | null;
  review_assignee: string | null;
  submitted_at: string | null;
  live_at: string | null;
  expires_at: string | null;
  sold_at: string | null;
  view_count: number;
  seller: {
    type: "merchant" | "private";
    user_id: string;
    merchant_id: string | null;
    owner_type: string;
    legal_name: string;
    email: string;
    phone: string | null;
    phone_verified: boolean;
    cleared: boolean;
    gate_reason: string | null;
  };
  documents: Array<{ kind: "logbook" | "bank_clearance_letter" | "ntsa_search"; label: string; required: boolean; doc: DocLine | null }>;
  photos: Array<{ slot: string; label: string; doc: DocLine | null }>;
  checklist: { items: CheckItem[]; outstanding: number; flagged: number; complete: boolean; suggested_note: string };
  reports: Array<{ id: string; reason: string; note: string | null; status: "open" | "dismissed" | "actioned"; created_at: string }>;
}

export function fetchSaleQueue(filter: SaleQueueFilter) {
  return apiGet<{ data: SaleQueueRow[]; total: number; has_more: boolean; next_cursor: string | null }>(
    `/admin/sale-listings?filter=${filter}&limit=100`,
  );
}

export const fetchSaleCase = (id: string) => apiGet<SaleCase>(`/admin/sale-listings/${id}`);

const idem = () => ({ headers: { "Idempotency-Key": `adm-${crypto.randomUUID()}` } });

export const setSaleCheck = (id: string, item_id: string, result: CheckItem["result"], note?: string) =>
  apiPost<SaleCase>(`/admin/sale-listings/${id}/checklist`, note ? { item_id, result, note } : { item_id, result });
export const decideSaleDocument = (id: string, documentId: string, decision: "accept" | "reject", note?: string) =>
  apiPost<SaleCase>(`/admin/sale-listings/${id}/documents/${documentId}/decision`, note ? { decision, note } : { decision }, idem());
export const decideSale = (id: string, action: "approve" | "request_changes" | "reject", note?: string) =>
  apiPost<SaleCase>(`/admin/sale-listings/${id}/decision`, note ? { action, note } : { action }, idem());
export const removeSale = (id: string, note: string) => apiPost<SaleCase>(`/admin/sale-listings/${id}/remove`, { note }, idem());
export const reinstateSale = (id: string) => apiPost<SaleCase>(`/admin/sale-listings/${id}/reinstate`, {}, idem());
export const resolveReport = (reportId: string, outcome: "dismissed" | "actioned") =>
  apiPost<SaleCase>(`/admin/sale-reports/${reportId}/resolve`, { outcome });

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** A sale document's bytes as an object URL, with the bearer token attached. */
export async function saleDocObjectUrl(listingId: string, documentId: string): Promise<string> {
  const { getAccessToken } = await import("./auth.js");
  const res = await fetch(`${API_BASE_URL}/admin/sale-listings/${listingId}/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`document ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

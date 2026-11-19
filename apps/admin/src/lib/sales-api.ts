import { apiGet, apiPost } from "./api.js";
import type { ChecklistItem } from "./vehicles-api.js";

/** Sale-listing review and reports - openapi/admin-sales.yaml (Phase 6 CS2). */

export type SaleStatus = "pending" | "review" | "action" | "rejected" | "live" | "paused" | "sold" | "withdrawn";
export type SaleQueueFilter = "open" | "changes_sent" | "live" | "rejected" | "closed" | "all";
export type ReportFilter = "open" | "handled" | "all";
type Money = { amount: number; currency: "KES" };

export interface SaleQueueRow {
  id: string;
  ref: string;
  title: string;
  registration: string;
  county: string;
  asking_price: Money;
  status: SaleStatus;
  merchant_id: string;
  merchant_name: string;
  merchant_approved: boolean;
  assignee_name: string | null;
  open_reports: number;
  submitted_at: string | null;
}

export interface SaleFile {
  id: string;
  kind: "photo" | "logbook";
  original_name: string;
  content_type: string;
  created_at: string;
}

export interface SaleCase {
  id: string;
  ref: string;
  status: SaleStatus;
  body_type: string;
  make: string;
  model: string;
  year: number;
  registration: string;
  mileage_km: number;
  transmission: string;
  fuel: string;
  engine_cc: number | null;
  colour: string | null;
  import_status: string;
  accident_history: string;
  known_faults: string;
  encumbered: boolean;
  asking_price: Money;
  negotiable: boolean;
  county: string;
  viewing_area: string;
  description: string | null;
  reviewer_note: string | null;
  submitted_at: string | null;
  live_at: string | null;
  assignee: { id: string; name: string } | null;
  photos: SaleFile[];
  logbook: SaleFile | null;
  merchant: { id: string; name: string; owner_type: string; approved: boolean };
  open_reports: number;
  checklist: {
    items: ChecklistItem[];
    checked: number;
    total: number;
    flagged: number;
    outstanding: number;
    complete: boolean;
    suggested_note: { changes: string; reject: string };
  };
}

export interface SaleReport {
  id: string;
  reason: string;
  details: string | null;
  status: "open" | "dismissed" | "actioned";
  reporter_name: string | null;
  handled_by_name: string | null;
  handled_at: string | null;
  handled_note: string | null;
  created_at: string;
  listing: { id: string; ref: string; title: string; status: SaleStatus; merchant_name: string };
}

export const REPORT_REASON_LABELS: Record<string, string> = {
  scam: "Looks like a scam",
  not_this_car: "Photos aren't this car",
  wrong_details: "Details are wrong",
  already_sold: "Already sold",
  offensive: "Offensive content",
  other: "Something else",
};

type Page<T> = { data: T[]; total: number; has_more: boolean; next_cursor: string | null };

export const fetchSaleQueue = (filter: SaleQueueFilter) => apiGet<Page<SaleQueueRow>>(`/admin/sale-listings?filter=${filter}&limit=100`);
export const fetchSaleCase = (id: string) => apiGet<SaleCase>(`/admin/sale-listings/${id}`);
export const assignSale = (id: string) => apiPost<SaleCase>(`/admin/sale-listings/${id}/assign`);
export const setSaleCheck = (id: string, body: { item_id: string; result: "pending" | "pass" | "flag"; note?: string | null }) =>
  apiPost<SaleCase>(`/admin/sale-listings/${id}/checklist`, body);

const idem = () => ({ headers: { "Idempotency-Key": `adm-${crypto.randomUUID()}` } });

export function decideSale(id: string, action: "approve" | "request_changes" | "reject", note?: string) {
  return apiPost<SaleCase>(`/admin/sale-listings/${id}/decision`, note ? { action, note } : { action }, idem());
}

export const fetchSaleReports = (filter: ReportFilter) => apiGet<Page<SaleReport>>(`/admin/sale-reports?filter=${filter}&limit=100`);

export function resolveSaleReport(id: string, action: "dismiss" | "pause" | "take_down", note?: string) {
  return apiPost<SaleReport>(`/admin/sale-reports/${id}/resolve`, note ? { action, note } : { action }, idem());
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** A file's bytes as an object URL, with the bearer token attached. */
export async function saleFileObjectUrl(listingId: string, fileId: string): Promise<string> {
  const { getAccessToken } = await import("./auth.js");
  const res = await fetch(`${API_BASE_URL}/admin/sale-listings/${listingId}/files/${fileId}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`file ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

export const kes = (m: Money) => `KES ${(m.amount / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

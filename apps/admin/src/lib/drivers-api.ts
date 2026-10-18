import { apiGet, apiPost } from "./api.js";

/** Driver review - openapi/admin-drivers.yaml. */

export type DriverStatus = "pending" | "review" | "action" | "rejected" | "live" | "paused";
export type DriverDocKind = "driving_licence" | "national_id" | "kra_pin";
export type DriverQueueFilter = "open" | "changes_sent" | "approved" | "rejected" | "all";

export interface Money {
  amount: number;
  currency: string;
}

export interface DriverQueueRow {
  id: string;
  full_name: string;
  county: string;
  status: DriverStatus;
  merchant_id: string;
  merchant_name: string;
  merchant_approved: boolean;
  docs_accepted: number;
  licence_expired: boolean;
  submitted_at: string | null;
}

export interface DriverCaseDocument {
  kind: DriverDocKind;
  label: string;
  document_id: string | null;
  original_name: string | null;
  state: "missing" | "pending" | "ok" | "expiring" | "rejected";
  review_note: string | null;
  expires_at: string | null;
  from_account: boolean;
}

export interface DriverCase {
  id: string;
  full_name: string;
  phone: string;
  national_id: string;
  kra_pin: string;
  licence_number: string;
  licence_expiry: string;
  licence_expired: boolean;
  county: string;
  is_account_holder: boolean;
  rates: { day: Money | null; hour: Money | null; trip: Money | null };
  status: DriverStatus;
  reviewer_note: string | null;
  submitted_at: string | null;
  merchant: { id: string; name: string; owner_type: string; approved: boolean };
  documents: DriverCaseDocument[];
}

export function fetchDriverQueue(filter: DriverQueueFilter) {
  return apiGet<{ data: DriverQueueRow[]; total: number; has_more: boolean; next_cursor: string | null }>(
    `/admin/drivers?filter=${filter}&limit=100`,
  );
}

export function fetchDriverCase(id: string) {
  return apiGet<DriverCase>(`/admin/drivers/${id}`);
}

const idem = () => ({ headers: { "Idempotency-Key": `adm-${crypto.randomUUID()}` } });

export function decideDriverDocument(id: string, kind: DriverDocKind, decision: "accept" | "reject", note?: string) {
  return apiPost<DriverCase>(`/admin/drivers/${id}/documents/${kind}/decision`, note ? { decision, note } : { decision }, idem());
}

export function decideDriver(id: string, action: "approve" | "request_changes" | "reject", note?: string) {
  return apiPost<DriverCase>(`/admin/drivers/${id}/decision`, note ? { action, note } : { action }, idem());
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** A driver document's bytes as an object URL, with the bearer token attached. */
export async function driverDocObjectUrl(driverId: string, documentId: string): Promise<string> {
  const { getAccessToken } = await import("./auth.js");
  const res = await fetch(`${API_BASE_URL}/admin/drivers/${driverId}/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`document ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

export function rateLine(rates: DriverCase["rates"]): string {
  const fmt = (m: Money) => `KES ${(m.amount / 100).toLocaleString("en-KE")}`;
  return [
    rates.day && `${fmt(rates.day)} / day`,
    rates.hour && `${fmt(rates.hour)} / hour`,
    rates.trip && `${fmt(rates.trip)} / trip`,
  ]
    .filter(Boolean)
    .join(" · ");
}

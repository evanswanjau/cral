import { apiGet, apiPost } from "./api.js";
import type { ChecklistItem, CheckResult } from "./vehicles-api.js";

/** Outlet review - openapi/admin-outlets.yaml (Phase 4 GS1). */

export type OutletStatus = "pending" | "review" | "action" | "rejected" | "live" | "paused";
export type OutletQueueFilter = "open" | "changes_sent" | "approved" | "rejected" | "all";

export const SERVICE_LABELS: Record<string, string> = {
  service: "Servicing",
  diagnostics: "Diagnostics",
  mechanical: "Mechanical repair",
  bodywork: "Bodywork and paint",
  tyres: "Tyres and alignment",
  electrical: "Electrical",
  ac: "Air conditioning",
};

export interface OutletQueueRow {
  id: string;
  kind: "garage" | "parts";
  name: string;
  county: string;
  status: OutletStatus;
  merchant_id: string;
  merchant_name: string;
  merchant_approved: boolean;
  assignee_name: string | null;
  visited: boolean;
  photo_count: number;
  submitted_at: string | null;
}

export interface OutletCase {
  id: string;
  kind: "garage" | "parts";
  name: string;
  address: string;
  county: string;
  phone: string | null;
  opening_hours: string;
  service_types: string[];
  status: OutletStatus;
  reviewer_note: string | null;
  submitted_at: string | null;
  assignee: { id: string; name: string } | null;
  visit: { visited_on: string; visited_by: string; recorded_by_name: string | null } | null;
  photos: Array<{ id: string; original_name: string; created_at: string }>;
  merchant: { id: string; name: string; owner_type: string; approved: boolean };
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

export function fetchOutletQueue(filter: OutletQueueFilter) {
  return apiGet<{ data: OutletQueueRow[]; total: number; has_more: boolean; next_cursor: string | null }>(
    `/admin/outlets?filter=${filter}&limit=100`,
  );
}

export const fetchOutletCase = (id: string) => apiGet<OutletCase>(`/admin/outlets/${id}`);
export const assignOutlet = (id: string) => apiPost<OutletCase>(`/admin/outlets/${id}/assign`);

export function setOutletCheck(
  id: string,
  body: { item_id: string; result: CheckResult; note?: string | null; visited_on?: string; visited_by?: string },
) {
  return apiPost<OutletCase>(`/admin/outlets/${id}/checklist`, body);
}

const idem = () => ({ headers: { "Idempotency-Key": `adm-${crypto.randomUUID()}` } });

export function decideOutlet(id: string, action: "approve" | "request_changes" | "reject", note?: string) {
  return apiPost<OutletCase>(`/admin/outlets/${id}/decision`, note ? { action, note } : { action }, idem());
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** A photo's bytes as an object URL, with the bearer token attached. */
export async function outletPhotoObjectUrl(outletId: string, photoId: string): Promise<string> {
  const { getAccessToken } = await import("./auth.js");
  const res = await fetch(`${API_BASE_URL}/admin/outlets/${outletId}/photos/${photoId}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`photo ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

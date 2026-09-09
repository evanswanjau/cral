import { apiGet, apiPost } from "./api.js";
import type {
  BackendVehicleStatus,
  ChecklistBlock,
  CheckResult,
  DocState,
  ReviewBucket,
} from "./vehicles-api.js";

export interface MerchantRow {
  id: string;
  name: string;
  initials: string;
  approved: boolean;
  badge: "verified" | "new_merchant";
  contact: string;
  joined: string;
  towns: string[];
  fleet: number;
  live: number;
  waiting: number;
}

export interface MerchantsResponse {
  data: MerchantRow[];
  next_cursor: string | null;
  has_more: boolean;
  total: number;
}

export interface MerchantFleetRow {
  id: string;
  registration: string;
  title: string;
  spec: string;
  status: BackendVehicleStatus;
  bucket: ReviewBucket;
  docs_accepted: number;
  docs_total: number;
  docs_has_issue: boolean;
  daily_rate: { amount: number; currency: string } | null;
  submitted_at: string;
}

export interface BusinessDocLine {
  kind: string;
  label: string;
  state: DocState;
  document_id: string | null;
  review_note: string | null;
  original_name: string | null;
}

export interface MerchantFile {
  id: string;
  name: string;
  initials: string;
  approved: boolean;
  badge: "verified" | "new_merchant";
  owner_type: string;
  contact: string;
  joined: string;
  towns: string[];
  note: string | null;
  can_approve: boolean;
  approve_blockers: { documents: number; checklist: number };
  outstanding_documents: string[];
  business_documents: BusinessDocLine[];
  checklist: ChecklistBlock;
  stats: { submitted: number; live: number; waiting: number; rejected: number };
  review_next: { id: string; registration: string } | null;
  fleet: MerchantFleetRow[];
  fleet_summary: string;
}

export function fetchMerchants(cursor?: string) {
  return apiGet<MerchantsResponse>(`/admin/merchants${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
}

export function fetchMerchantFile(merchantId: string) {
  return apiGet<MerchantFile>(`/admin/merchants/${merchantId}`);
}

const idem = () => ({ headers: { "Idempotency-Key": `adm-${crypto.randomUUID()}` } });

export function decideBusinessDocument(
  merchantId: string,
  kind: string,
  decision: "accept" | "reject",
  note?: string,
) {
  return apiPost<MerchantFile>(
    `/admin/merchants/${merchantId}/documents/${kind}/decision`,
    note ? { decision, note } : { decision },
    idem(),
  );
}

export function setMerchantChecklistItem(
  merchantId: string,
  itemId: string,
  result: CheckResult,
  note?: string,
) {
  return apiPost<MerchantFile>(`/admin/merchants/${merchantId}/checklist`, {
    item_id: itemId,
    result,
    ...(note ? { note } : {}),
  });
}

export function approveMerchant(merchantId: string) {
  return apiPost<MerchantFile>(`/admin/merchants/${merchantId}/approve`, undefined, idem());
}

export function reopenMerchantReview(merchantId: string) {
  return apiPost<MerchantFile>(`/admin/merchants/${merchantId}/reopen`, undefined, idem());
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** A business document's bytes as an object URL, with the bearer token attached. */
export async function businessDocObjectUrl(merchantId: string, documentId: string): Promise<string> {
  const { getAccessToken } = await import("./auth.js");
  const res = await fetch(`${API_BASE_URL}/admin/merchants/${merchantId}/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`document ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

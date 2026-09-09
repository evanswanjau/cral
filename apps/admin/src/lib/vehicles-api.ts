import { apiGet, apiPost } from "./api.js";

export type ReviewBucket = "needs_review" | "with_you" | "changes_sent" | "approved" | "rejected";
export type BackendVehicleStatus = "pending" | "review" | "action" | "live" | "rejected";
export type DocState = "ok" | "pending" | "expiring" | "rejected" | "missing";
export type CheckOutcome = "pass" | "look" | "fail";
export type EventTone = "grey" | "blue" | "green" | "amber" | "red";

export interface QueueRow {
  id: string;
  registration: string;
  title: string;
  type: string;
  year: string;
  county: string | null;
  merchant_id: string;
  merchant_name: string;
  status: BackendVehicleStatus;
  bucket: ReviewBucket;
  docs_accepted: number;
  docs_total: number;
  docs_has_issue: boolean;
  waiting_hours: number;
  overdue: boolean;
  assignee_initials: string | null;
  assigned_to_me: boolean;
  submitted_at: string;
}

export interface QueueResponse {
  data: QueueRow[];
  next_cursor: string | null;
  has_more: boolean;
  counts: Record<ReviewBucket | "all", number>;
  sla_days: number;
  mine: { assigned_open: number; breached: number };
  decided_today: { approved: number; changes: number; rejected: number };
}

export interface DocLine {
  kind: string;
  scope: "vehicle" | "account";
  label: string;
  state: DocState;
  document_id: string | null;
  review_note: string | null;
  original_name: string | null;
  expires_at: string | null;
  /** This document's slice of the review checklist, shown as an accordion. */
  checklist: ChecklistBlock;
}

export interface CheckLine {
  id: string;
  outcome: CheckOutcome;
  label: string;
  detail: string;
}

export interface CaseEvent {
  label: string;
  body: string | null;
  tone: EventTone;
  actor_name: string | null;
  occurred_at: string;
}

export type CheckSeverity = "block" | "flag";
export type CheckResult = "pending" | "pass" | "flag";

export interface ChecklistItem {
  id: string;
  group: string;
  document: string | null;
  severity: CheckSeverity;
  label: string;
  help: string;
  result: CheckResult;
  note: string | null;
}

export interface ChecklistBlock {
  items: ChecklistItem[];
  checked: number;
  total: number;
  flagged: number;
  blockers_outstanding: number;
  suggested_note: { changes: string; reject: string };
}

export interface AccountDocLine {
  kind: string;
  label: string;
  state: DocState;
  verified_with_account: boolean;
}

export interface ReviewCase {
  id: string;
  registration: string;
  listing_ref: string | null;
  title: string;
  type: string;
  year: string;
  seats: number;
  transmission: string;
  fuel: string;
  colour: string | null;
  county: string | null;
  pickup_address: string | null;
  status: BackendVehicleStatus;
  bucket: ReviewBucket;
  minimum_hire_days: number;
  chauffeured: boolean;
  daily_rate: { amount: number; currency: string } | null;
  submitted_at: string;
  waiting_hours: number;
  sla_days: number;
  overdue: boolean;
  reviewer_note: string | null;
  reviewer_note_resolved: boolean;
  assigned_to_me: boolean;
  can_approve: boolean;
  approve_blockers: { documents: number; checklist: number; merchant_not_approved: boolean };
  outstanding_documents: string[];
  merchant_approved: boolean;
  documents: DocLine[];
  account_documents: AccountDocLine[];
  /** The whole checklist - drives the approve gate and the pre-filled note. */
  checklist: ChecklistBlock;
  /** The photo-review items (no document row, so no auto-accept). */
  photos_checklist: ChecklistBlock;
  photos: { document_id: string; original_name: string }[];
  checks: CheckLine[];
  events: CaseEvent[];
  merchant: {
    id: string;
    name: string;
    initials: string;
    owner_type: string;
    contact_phone: string | null;
    approved: boolean;
    member_since: string;
    live_vehicles: number;
    prior_rejections: number;
  };
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export function fetchQueue(params: { bucket?: ReviewBucket | "all"; mine?: boolean; cursor?: string }) {
  const q = new URLSearchParams();
  if (params.bucket && params.bucket !== "all") q.set("bucket", params.bucket);
  if (params.mine) q.set("mine", "true");
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  return apiGet<QueueResponse>(`/admin/vehicles${qs ? `?${qs}` : ""}`);
}

export function fetchCase(vehicleId: string) {
  return apiGet<ReviewCase>(`/admin/vehicles/${vehicleId}`);
}

export function assignCase(vehicleId: string) {
  return apiPost<ReviewCase>(`/admin/vehicles/${vehicleId}/assign`);
}

export function setChecklistItem(vehicleId: string, itemId: string, result: CheckResult, note?: string) {
  return apiPost<ReviewCase>(`/admin/vehicles/${vehicleId}/checklist`, {
    item_id: itemId,
    result,
    ...(note ? { note } : {}),
  });
}

const idemHeaders = () => ({ headers: { "Idempotency-Key": `adm-${crypto.randomUUID()}` } });

export function decideDocument(
  vehicleId: string,
  kind: string,
  decision: "accept" | "reject",
  note?: string,
) {
  return apiPost<ReviewCase>(
    `/admin/vehicles/${vehicleId}/documents/${kind}/decision`,
    note ? { decision, note } : { decision },
    idemHeaders(),
  );
}

export function decideListing(
  vehicleId: string,
  action: "approve" | "request_changes" | "reject",
  note?: string,
) {
  return apiPost<ReviewCase>(
    `/admin/vehicles/${vehicleId}/decision`,
    note ? { action, note } : { action },
    idemHeaders(),
  );
}

/** A document's bytes as an object URL, with the bearer token attached. */
export async function documentObjectUrl(vehicleId: string, documentId: string): Promise<string> {
  const { getAccessToken } = await import("./auth.js");
  const res = await fetch(`${API_BASE_URL}/admin/vehicles/${vehicleId}/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`document ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

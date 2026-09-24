import { apiGet, apiPost } from "./api.js";

export type RenterQueueStatus = "pending" | "verified" | "rejected";
export type RenterDocState = "missing" | "pending" | "ok" | "rejected";
export type RenterDocKind = "national_id" | "driving_licence";

export interface RenterQueueRow {
  user_id: string;
  name: string;
  email: string;
  status: RenterQueueStatus;
  uploaded_at: string;
}

export interface RentersResponse {
  data: RenterQueueRow[];
  next_cursor: string | null;
  has_more: boolean;
  total: number;
}

export interface RenterDocument {
  document_id: string | null;
  kind: RenterDocKind;
  state: RenterDocState;
  original_name: string | null;
  /** `YYYY-MM-DD`, licence only. */
  expires_at: string | null;
  review_note: string | null;
  reviewed_at: string | null;
}

export interface RenterFile {
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  verified: boolean;
  documents: RenterDocument[];
  booking_count: number;
  member_since: string;
}

export function fetchRenters(params: { filter?: string; cursor?: string } = {}) {
  const q = new URLSearchParams();
  if (params.filter && params.filter !== "all") q.set("filter", params.filter);
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  return apiGet<RentersResponse>(`/admin/renters${qs ? `?${qs}` : ""}`);
}

export function fetchRenterFile(userId: string) {
  return apiGet<RenterFile>(`/admin/renters/${userId}`);
}

const idem = () => ({ headers: { "Idempotency-Key": `adm-${crypto.randomUUID()}` } });

export function decideRenterDocument(
  userId: string,
  kind: RenterDocKind,
  decision: "accept" | "reject",
  note?: string,
) {
  return apiPost<RenterFile>(
    `/admin/renters/${userId}/documents/${kind}/decision`,
    note ? { decision, note } : { decision },
    idem(),
  );
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** A renter document's bytes as an object URL, with the bearer token attached. */
export async function renterDocObjectUrl(userId: string, documentId: string): Promise<string> {
  const { getAccessToken } = await import("./auth.js");
  const res = await fetch(`${API_BASE_URL}/admin/renters/${userId}/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`document ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

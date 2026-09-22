import { apiGet, apiPost } from "./api.js";

/** Typed client for `POST/GET /me/documents` (customer-account module). */

export type RenterDocKind = "national_id" | "driving_licence";
export type DocumentState = "missing" | "pending" | "ok" | "rejected" | "expiring";

export interface RenterVerification {
  verified: boolean;
  documents: { kind: RenterDocKind; state: DocumentState; review_note: string | null }[];
  outstanding: RenterDocKind[];
}

export function getRenterDocuments() {
  return apiGet<{ documents: unknown[]; verification: RenterVerification }>("/me/documents");
}

/**
 * `expiresAt` (`YYYY-MM-DD`) is required by the API for a licence and
 * ignored for an ID - a Kenyan licence expires, a national ID does not.
 */
export function uploadRenterDocument(kind: RenterDocKind, file: File, expiresAt?: string) {
  const formData = new FormData();
  formData.append("kind", kind);
  if (expiresAt) formData.append("expires_at", expiresAt);
  formData.append("file", file);
  return apiPost<{ id: string; kind: RenterDocKind }>("/me/documents", undefined, { formData });
}

export function documentSrc(documentId: string): string {
  const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
  return `${API_BASE_URL}/me/documents/${documentId}`;
}

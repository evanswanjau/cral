import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "./api.js";
import { deleteDocument as deleteOnboardingDocument, uploadVehiclePhoto as uploadOnboardingVehiclePhoto } from "./onboarding-draft.js";

export type VehicleFilter = "all" | "awaiting_approval" | "needs_action" | "live" | "draft";
export type VehicleStatus = "draft" | "pending" | "review" | "action" | "rejected" | "live" | "paused";
export type VerificationBadge = "none" | "pending" | "active";

export interface Money {
  amount: number;
  currency: string;
}

export interface VehicleSummary {
  id: string;
  listing_ref: string | null;
  registration: string;
  make: string;
  model: string;
  type: string;
  year: string;
  seats: number;
  county: string | null;
  pickup_address: string | null;
  status: VehicleStatus;
  verification_badge: VerificationBadge;
  doc_count: number;
  doc_has_issue: boolean;
  daily_rate: Money | null;
  submitted_at: string | null;
  created_at: string;
}

export interface VehicleDocInfo {
  document_id: string;
  original_name: string;
  review_state: "ok" | "pending" | "expiring" | "rejected";
  expires_at: string | null;
}

export interface VehicleEvent {
  label: string;
  body: string | null;
  tone: "grey" | "blue" | "green" | "amber" | "red";
  actor_name: string | null;
  occurred_at: string;
}

export interface VehicleDetail extends VehicleSummary {
  transmission: string;
  fuel: string;
  colour: string | null;
  minimum_hire_days: number;
  chauffeured: boolean;
  rate_mode: "list" | "net";
  verification_badge_expires_at: string | null;
  reviewer_note: string | null;
  reviewer_note_meta: string | null;
  reviewer_note_resolved: boolean;
  documents: {
    logbook: VehicleDocInfo | null;
    comprehensive_insurance: VehicleDocInfo | null;
    tracker_certificate: VehicleDocInfo | null;
  };
  photos: { document_id: string; original_name: string }[];
  events: VehicleEvent[];
  owner_documents_complete: boolean;
  owner_documents_uploaded_at: string | null;
  /** Set only once an admin has approved the merchant account - see CLAUDE.md's note on merchant approval. */
  merchant_approved: boolean;
  owner_documents: {
    national_id: VehicleDocInfo | null;
    kra_pin: VehicleDocInfo | null;
  };
  merchant_name: string | null;
  payout: { method: string; detail: string | null; account_name: string | null };
}

export interface VehicleListResult {
  data: VehicleSummary[];
  next_cursor: string | null;
  has_more: boolean;
  counts: Record<VehicleFilter, number>;
}

export function listVehicles(filter: VehicleFilter) {
  const q = filter === "all" ? "" : `?filter=${filter}`;
  return apiGet<VehicleListResult>(`/merchant/vehicles${q}`);
}

export function getVehicle(id: string) {
  return apiGet<VehicleDetail>(`/merchant/vehicles/${id}`);
}

export interface CreateVehicleInput {
  type: string;
  make: string;
  model: string;
  year: string;
  registration: string;
  transmission: string;
  fuel: string;
  colour?: string | undefined;
  seats?: number | undefined;
  county: string;
  pickup_address: string;
  daily_rate: string;
  rate_mode?: "list" | "net" | undefined;
  minimum_hire_days?: number | undefined;
  chauffeured?: boolean | undefined;
}

export function createVehicle(input: CreateVehicleInput) {
  return apiPost<VehicleDetail>("/merchant/vehicles", input);
}

export interface PriceAvailabilityInput {
  daily_rate?: string;
  rate_mode?: "list" | "net";
  minimum_hire_days?: number;
  county?: string;
  pickup_address?: string;
  chauffeured?: boolean;
}

export function updatePriceAvailability(id: string, input: PriceAvailabilityInput) {
  return apiPatch<VehicleDetail>(`/merchant/vehicles/${id}`, input);
}

export function deleteVehicleConfirmed(id: string, registration: string) {
  return apiDelete<void>(`/merchant/vehicles/${id}`, { registration });
}

export function submitVehicle(id: string) {
  return apiPost<VehicleDetail>(`/merchant/vehicles/${id}/submit`);
}

export function pauseVehicle(id: string) {
  return apiPost<VehicleDetail>(`/merchant/vehicles/${id}/pause`);
}

export function resumeVehicle(id: string) {
  return apiPost<VehicleDetail>(`/merchant/vehicles/${id}/resume`);
}

export function duplicateVehicle(id: string) {
  return apiPost<VehicleDetail>(`/merchant/vehicles/${id}/duplicate`);
}

export function messageReviewer(id: string, message: string) {
  return apiPost<VehicleDetail>(`/merchant/vehicles/${id}/messages`, { message });
}

function idempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function requestVerification(id: string) {
  return apiPost<VehicleDetail>(`/merchant/vehicles/${id}/verification`, undefined, {
    headers: { "Idempotency-Key": idempotencyKey() },
  });
}

export function uploadVehicleDocument(
  id: string,
  kind: "logbook" | "comprehensive_insurance" | "tracker_certificate",
  file: File,
  expiresAt?: string,
) {
  const formData = new FormData();
  formData.append("kind", kind);
  if (expiresAt) formData.append("expires_at", expiresAt);
  formData.append("file", file);
  return apiUpload<VehicleDetail>(`/merchant/vehicles/${id}/documents`, formData);
}

// --- TanStack Query hooks -----------------------------------------------

export function useVehicleList(filter: VehicleFilter) {
  return useQuery({ queryKey: ["vehicles", filter], queryFn: () => listVehicles(filter) });
}

export function useVehicleDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => getVehicle(id as string),
    enabled: !!id,
  });
}

function useInvalidateVehicles() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    if (id) void queryClient.invalidateQueries({ queryKey: ["vehicle", id] });
  };
}

export function useUpdatePriceAvailability(id: string) {
  const invalidate = useInvalidateVehicles();
  return useMutation({
    mutationFn: (input: PriceAvailabilityInput) => updatePriceAvailability(id, input),
    onSuccess: () => invalidate(id),
  });
}

export function usePauseVehicle(id: string) {
  const invalidate = useInvalidateVehicles();
  return useMutation({ mutationFn: () => pauseVehicle(id), onSuccess: () => invalidate(id) });
}

export function useResumeVehicle(id: string) {
  const invalidate = useInvalidateVehicles();
  return useMutation({ mutationFn: () => resumeVehicle(id), onSuccess: () => invalidate(id) });
}

export function useDuplicateVehicle(id: string) {
  const invalidate = useInvalidateVehicles();
  return useMutation({ mutationFn: () => duplicateVehicle(id), onSuccess: () => invalidate() });
}

export function useDeleteVehicle(id: string) {
  const invalidate = useInvalidateVehicles();
  return useMutation({
    mutationFn: (registration: string) => deleteVehicleConfirmed(id, registration),
    onSuccess: () => invalidate(),
  });
}

export function useMessageReviewer(id: string) {
  const invalidate = useInvalidateVehicles();
  return useMutation({ mutationFn: (message: string) => messageReviewer(id, message), onSuccess: () => invalidate(id) });
}

export function useRequestVerification(id: string) {
  const invalidate = useInvalidateVehicles();
  return useMutation({ mutationFn: () => requestVerification(id), onSuccess: () => invalidate(id) });
}

export function useSubmitVehicle(id: string) {
  const invalidate = useInvalidateVehicles();
  return useMutation({ mutationFn: () => submitVehicle(id), onSuccess: () => invalidate(id) });
}

export function useUploadVehicleDocument(id: string) {
  const invalidate = useInvalidateVehicles();
  return useMutation({
    mutationFn: (input: { kind: "logbook" | "comprehensive_insurance" | "tracker_certificate"; file: File; expiresAt?: string | undefined }) =>
      uploadVehicleDocument(id, input.kind, input.file, input.expiresAt),
    onSuccess: () => invalidate(id),
  });
}

// Photos go through the onboarding documents endpoint (kind=vehicle_photo)
// rather than the vehicles module's own document endpoint - it already
// handles the 3-photo cap and works for any vehicle the caller owns,
// onboarding or not, so there's no reason to duplicate it here.
export function useUploadVehiclePhoto(id: string) {
  const invalidate = useInvalidateVehicles();
  return useMutation({
    mutationFn: (file: File) => uploadOnboardingVehiclePhoto(id, file),
    onSuccess: () => invalidate(id),
  });
}

export function useDeleteVehiclePhoto(id: string) {
  const invalidate = useInvalidateVehicles();
  return useMutation({
    mutationFn: (documentId: string) => deleteOnboardingDocument(documentId),
    onSuccess: () => invalidate(id),
  });
}

/** A vehicle document (logbook/insurance/tracker) can be removed the same way a photo can - only wired up while the vehicle is still a draft. */
export function useDeleteVehicleDocument(id: string) {
  const invalidate = useInvalidateVehicles();
  return useMutation({
    mutationFn: (documentId: string) => deleteOnboardingDocument(documentId),
    onSuccess: () => invalidate(id),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBlob, apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "./api.js";
import type { Money, VehicleStatus } from "./vehicles-api.js";

/** Merchant drivers - openapi/merchant-drivers.yaml. */

export type DriverDocKind = "driving_licence" | "national_id" | "kra_pin";

export interface DriverDocSlot {
  document_id: string;
  original_name: string;
  review_state: "ok" | "pending" | "expiring" | "rejected";
  review_note: string | null;
  expires_at: string | null;
  from_account: boolean;
}

export interface Driver {
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
  status: VehicleStatus;
  reviewer_note: string | null;
  /** The driver's one photo (DR2), or null. Changes on every upload. */
  photo_id: string | null;
  documents: Record<DriverDocKind, DriverDocSlot | null>;
  doc_count: number;
  submitted_at: string | null;
  created_at: string;
}

export interface DriverInput {
  full_name: string;
  phone: string;
  national_id: string;
  kra_pin: string;
  licence_number: string;
  licence_expiry: string;
  county: string;
  is_account_holder?: boolean;
  daily_rate?: string;
  hourly_rate?: string;
  trip_rate?: string;
}

export const DRIVER_DOC_LABELS: Record<DriverDocKind, string> = {
  driving_licence: "Driving licence",
  national_id: "National ID",
  kra_pin: "KRA PIN certificate",
};
export const DRIVER_DOC_ORDER: DriverDocKind[] = ["driving_licence", "national_id", "kra_pin"];

/** "KES 3,000 / day · KES 500 / hour" - only the rates that are set. */
export function driverRateLine(d: Pick<Driver, "rates">): string {
  const parts: string[] = [];
  const fmt = (m: Money) => `KES ${(m.amount / 100).toLocaleString("en-KE")}`;
  if (d.rates.day) parts.push(`${fmt(d.rates.day)} / day`);
  if (d.rates.hour) parts.push(`${fmt(d.rates.hour)} / hour`);
  if (d.rates.trip) parts.push(`${fmt(d.rates.trip)} / trip`);
  return parts.join(" · ");
}

export const listDrivers = () =>
  apiGet<{ data: Driver[]; counts: { all: number; needs_action: number; live: number } }>("/merchant/drivers?limit=100");
export const getDriver = (id: string) => apiGet<Driver>(`/merchant/drivers/${id}`);
export const createDriver = (input: DriverInput) => apiPost<Driver>("/merchant/drivers", input);

export function useDriverList() {
  return useQuery({ queryKey: ["drivers"], queryFn: listDrivers });
}

export function useDriver(id: string | undefined) {
  return useQuery({ queryKey: ["driver", id], queryFn: () => getDriver(id as string), enabled: !!id });
}

function useInvalidate(id?: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["drivers"] });
    if (id) void qc.invalidateQueries({ queryKey: ["driver", id] });
  };
}

export function useUpdateDriver(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (input: Partial<Omit<DriverInput, "is_account_holder">>) => apiPatch<Driver>(`/merchant/drivers/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useUploadDriverDocument(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (input: { kind: DriverDocKind; file: File; expiresAt?: string | undefined }) => {
      const form = new FormData();
      form.append("kind", input.kind);
      if (input.expiresAt) form.append("expires_at", input.expiresAt);
      form.append("file", input.file);
      return apiUpload<Driver>(`/merchant/drivers/${id}/documents`, form);
    },
    onSuccess: invalidate,
  });
}

export function useDriverAction(id: string, action: "submit" | "pause" | "resume") {
  const invalidate = useInvalidate(id);
  return useMutation({ mutationFn: () => apiPost<Driver>(`/merchant/drivers/${id}/${action}`), onSuccess: invalidate });
}

export function useDeleteDriver(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: () => apiDelete<void>(`/merchant/drivers/${id}`), onSuccess: invalidate });
}

// ---------------------------------------------------------------------
// Photo (DR2) - a picture, not a document: no review, no status change.
// ---------------------------------------------------------------------

export const DRIVER_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const MAX_DRIVER_PHOTO_BYTES = 10 * 1024 * 1024;

/** A reason the photo can't be sent, or null - the API checks the bytes as well. */
export function driverPhotoProblem(file: File): string | null {
  if (!DRIVER_PHOTO_ACCEPT.split(",").includes(file.type)) return "Pick a JPEG, PNG or WebP photo.";
  if (file.size > MAX_DRIVER_PHOTO_BYTES) return "That photo is over 10 MB. Pick a smaller one.";
  return null;
}

export function setDriverPhoto(id: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<Driver>(`/merchant/drivers/${id}/photo`, form);
}

export function useSetDriverPhoto(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({ mutationFn: (file: File) => setDriverPhoto(id, file), onSuccess: invalidate });
}

export function useRemoveDriverPhoto(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({ mutationFn: () => apiDelete<Driver>(`/merchant/drivers/${id}/photo`), onSuccess: invalidate });
}

/**
 * An object URL for the driver's photo, fetched with the merchant's token
 * (an <img> can't send one). Keyed by the photo id, which changes on every
 * upload, so a replaced photo is fetched fresh and the old one never shows.
 */
export function useDriverPhotoSrc(driverId: string, photoId: string | null) {
  return useQuery({
    queryKey: ["driver-photo", photoId],
    queryFn: async () => URL.createObjectURL(await apiBlob(`/merchant/drivers/${driverId}/photo`)),
    enabled: !!photoId,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}

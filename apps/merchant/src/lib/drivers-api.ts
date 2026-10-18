import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "./api.js";
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

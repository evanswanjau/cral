import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBlob, apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "./api.js";
import type { VehicleStatus } from "../components/portal/status.js";

/** Merchant outlets, "Your premises" - openapi/merchant-outlets.yaml (Phase 4 GS1). */

export type ServiceType = "service" | "diagnostics" | "mechanical" | "bodywork" | "tyres" | "electrical" | "ac";

export const SERVICE_TYPES: ServiceType[] = ["service", "diagnostics", "mechanical", "bodywork", "tyres", "electrical", "ac"];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  service: "Servicing",
  diagnostics: "Diagnostics",
  mechanical: "Mechanical repair",
  bodywork: "Bodywork and paint",
  tyres: "Tyres and alignment",
  electrical: "Electrical",
  ac: "Air conditioning",
};

/** Same limits the API enforces. */
export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 8;

export interface OutletPhoto {
  id: string;
  original_name: string;
  created_at: string;
}

export interface Outlet {
  id: string;
  kind: "garage" | "parts";
  name: string;
  address: string;
  county: string;
  phone: string | null;
  opening_hours: string;
  service_types: ServiceType[];
  status: VehicleStatus;
  reviewer_note: string | null;
  /** True only when a CRAL reviewer recorded a visit to this address. */
  visited: boolean;
  visited_on: string | null;
  photos: OutletPhoto[];
  submitted_at: string | null;
  created_at: string;
}

export interface OutletInput {
  name: string;
  address: string;
  county: string;
  phone: string;
  opening_hours: string;
  service_types: ServiceType[];
}

/** Name, address and county lock while CRAL has the premises and once approved. */
export const DETAIL_EDITABLE: VehicleStatus[] = ["draft", "action", "rejected"];

export const listOutlets = () =>
  apiGet<{ data: Outlet[]; counts: { all: number; needs_action: number; live: number } }>("/merchant/outlets?limit=100");
export const getOutlet = (id: string) => apiGet<Outlet>(`/merchant/outlets/${id}`);
export const createOutlet = (input: OutletInput) => apiPost<Outlet>("/merchant/outlets", { kind: "garage", ...input });
export const outletPhotoBlob = (outletId: string, photoId: string) => apiBlob(`/merchant/outlets/${outletId}/photos/${photoId}`);

export function useOutletList(enabled = true) {
  return useQuery({ queryKey: ["outlets"], queryFn: listOutlets, enabled });
}

export function useOutlet(id: string | undefined) {
  return useQuery({ queryKey: ["outlet", id], queryFn: () => getOutlet(id as string), enabled: !!id });
}

function useInvalidate(id?: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["outlets"] });
    if (id) void qc.invalidateQueries({ queryKey: ["outlet", id] });
  };
}

export function useUpdateOutlet(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (input: Partial<OutletInput>) => apiPatch<Outlet>(`/merchant/outlets/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useUploadOutletPhoto(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload<Outlet>(`/merchant/outlets/${id}/photos`, form);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteOutletPhoto(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (photoId: string) => apiDelete<Outlet>(`/merchant/outlets/${id}/photos/${photoId}`),
    onSuccess: invalidate,
  });
}

export function useOutletAction(id: string, action: "submit" | "pause" | "resume") {
  const invalidate = useInvalidate(id);
  return useMutation({ mutationFn: () => apiPost<Outlet>(`/merchant/outlets/${id}/${action}`), onSuccess: invalidate });
}

export function useDeleteOutlet(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: () => apiDelete<void>(`/merchant/outlets/${id}`), onSuccess: invalidate });
}

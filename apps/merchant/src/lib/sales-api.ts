import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBlob, apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "./api.js";
import type { SaleStatus } from "../components/portal/status.js";

/** Merchant sale listings, "Cars for sale" - openapi/merchant-sales.yaml (Phase 6 CS1). */

export type BodyType = "sedan" | "suv" | "van" | "pickup" | "hatchback" | "wagon" | "truck" | "other";
export type ImportStatus = "locally_used" | "foreign_used" | "new";
export type AccidentHistory = "none" | "minor" | "major";

export const BODY_LABELS: Record<BodyType, string> = {
  sedan: "Saloon",
  suv: "SUV",
  van: "Van",
  pickup: "Pickup",
  hatchback: "Hatchback",
  wagon: "Station wagon",
  truck: "Truck",
  other: "Other",
};
export const IMPORT_LABELS: Record<ImportStatus, string> = {
  locally_used: "Locally used",
  foreign_used: "Foreign used",
  new: "New",
};
export const ACCIDENT_LABELS: Record<AccidentHistory, string> = {
  none: "No accidents",
  minor: "Minor accident, repaired",
  major: "Major accident, repaired",
};

/** Same limits the API enforces. */
export const MIN_SALE_PHOTOS = 4;
export const MAX_SALE_PHOTOS = 12;

export interface Money {
  amount: number;
  currency: "KES";
}

export interface SaleFile {
  id: string;
  kind: "photo" | "logbook";
  original_name: string;
  created_at: string;
}

export interface SaleListingInput {
  body_type: BodyType;
  make: string;
  model: string;
  year: number;
  registration: string;
  mileage_km: number;
  transmission: "automatic" | "manual";
  fuel: "petrol" | "diesel" | "hybrid" | "electric";
  engine_cc: number | null;
  colour: string | null;
  import_status: ImportStatus;
  accident_history: AccidentHistory;
  known_faults: string;
  encumbered: boolean;
  asking_price: Money;
  negotiable: boolean;
  county: string;
  viewing_area: string;
  description: string | null;
}

export interface SaleListing extends SaleListingInput {
  id: string;
  ref: string;
  status: SaleStatus;
  reviewer_note: string | null;
  photos: SaleFile[];
  logbook: SaleFile | null;
  submitted_at: string | null;
  live_at: string | null;
  sold_at: string | null;
  created_at: string;
}

/** Every field can change only here; on live/paused only price, negotiable, viewing area and description. */
export const FULLY_EDITABLE: SaleStatus[] = ["draft", "action", "rejected"];
export const OPEN_EDITABLE: SaleStatus[] = ["live", "paused"];

export const fmtKes = (m: Money): string => `KES ${Math.round(m.amount / 100).toLocaleString("en-KE")}`;

export const listSaleListings = () =>
  apiGet<{ data: SaleListing[]; counts: { all: number; needs_action: number; live: number } }>("/merchant/sale-listings?limit=100");
export const createSaleListing = (input: SaleListingInput) => apiPost<SaleListing>("/merchant/sale-listings", input);
export const saleFileBlob = (listingId: string, fileId: string) => apiBlob(`/merchant/sale-listings/${listingId}/files/${fileId}`);

export function useSaleListingList(enabled = true) {
  return useQuery({ queryKey: ["sale-listings"], queryFn: listSaleListings, enabled });
}

export function useSaleListing(id: string | undefined) {
  return useQuery({ queryKey: ["sale-listing", id], queryFn: () => apiGet<SaleListing>(`/merchant/sale-listings/${id}`), enabled: !!id });
}

function useInvalidate(id?: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["sale-listings"] });
    if (id) void qc.invalidateQueries({ queryKey: ["sale-listing", id] });
  };
}

export function useUpdateSaleListing(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (input: Partial<SaleListingInput>) => apiPatch<SaleListing>(`/merchant/sale-listings/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useUploadSaleFile(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: ({ kind, file }: { kind: "photo" | "logbook"; file: File }) => {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file);
      return apiUpload<SaleListing>(`/merchant/sale-listings/${id}/files`, form);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSaleFile(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (fileId: string) => apiDelete<SaleListing>(`/merchant/sale-listings/${id}/files/${fileId}`),
    onSuccess: invalidate,
  });
}

export function useSubmitSaleListing(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({ mutationFn: () => apiPost<SaleListing>(`/merchant/sale-listings/${id}/submit`), onSuccess: invalidate });
}

export function useSetSaleStatus(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (to: "paused" | "live" | "sold" | "withdrawn") => apiPost<SaleListing>(`/merchant/sale-listings/${id}/status`, { to }),
    onSuccess: invalidate,
  });
}

export function useDeleteSaleListing(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: () => apiDelete<void>(`/merchant/sale-listings/${id}`), onSuccess: invalidate });
}

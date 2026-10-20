import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "./api.js";
import type { Money } from "./vehicles-api.js";

/** Selling a car - openapi/sales-seller.yaml (docs/plans/car-sales.md). */

export type SaleStatus =
  | "draft"
  | "pending"
  | "review"
  | "action"
  | "rejected"
  | "live"
  | "paused"
  | "under_offer"
  | "sold"
  | "withdrawn"
  | "expired"
  | "removed";

export type PhotoSlot =
  | "front"
  | "rear"
  | "left"
  | "right"
  | "interior_front"
  | "interior_rear"
  | "dashboard"
  | "engine_bay";

export const PHOTO_SLOTS: PhotoSlot[] = [
  "front",
  "rear",
  "left",
  "right",
  "interior_front",
  "interior_rear",
  "dashboard",
  "engine_bay",
];

/** Mirrors `PHOTO_LABELS` in apps/api/src/modules/sale-listings/shared.ts - keep in step. */
export const PHOTO_LABELS: Record<PhotoSlot, string> = {
  front: "Front, plate showing",
  rear: "Rear, plate showing",
  left: "Left side",
  right: "Right side",
  interior_front: "Front seats and dashboard",
  interior_rear: "Rear seats",
  dashboard: "Odometer, engine running",
  engine_bay: "Engine bay with the chassis plate",
};

export type SaleDocKind = "logbook" | "bank_clearance_letter" | "ntsa_search";
export const SALE_DOC_LABELS: Record<SaleDocKind, string> = {
  logbook: "Logbook",
  bank_clearance_letter: "Bank clearance letter",
  ntsa_search: "NTSA official search",
};

export interface SaleDocSlot {
  document_id: string;
  original_name: string;
  review_state: "ok" | "pending" | "expiring" | "rejected";
  review_note: string | null;
}

export interface SaleCar {
  category: string;
  make: string;
  model: string;
  year: number;
  registration: string;
  chassis_number: string;
  mileage_km: number;
  engine_cc: number | null;
  transmission: string;
  fuel: string;
  colour: string | null;
  drive: string | null;
  import_status: string;
}

export interface SaleListing {
  id: string;
  ref: string | null;
  title: string;
  status: SaleStatus;
  vehicle_id: string | null;
  seller_type: "merchant" | "private";
  seller_cleared: boolean;
  seller_gate_reason: string | null;
  car: SaleCar;
  asking_price: Money;
  negotiable: boolean;
  disclosures: {
    known_faults: string;
    accident_history: string;
    accident_note: string | null;
    encumbered: boolean;
    service_history: string;
  };
  county: string;
  viewing_area: string;
  description: string | null;
  auto_share_contact: boolean;
  reviewer_note: string | null;
  documents: Record<SaleDocKind, SaleDocSlot | null> & { photos: Record<PhotoSlot, SaleDocSlot | null> };
  missing_for_submit: string[];
  enquiries: { total: number; new: number };
  view_count: number;
  submitted_at: string | null;
  live_at: string | null;
  expires_at: string | null;
  sold_at: string | null;
  created_at: string;
}

export interface SaleListingInput {
  category: string;
  make: string;
  model: string;
  year: string;
  registration: string;
  chassis_number: string;
  mileage_km: string;
  engine_cc: string;
  transmission: string;
  fuel: string;
  colour: string;
  drive: string;
  import_status: string;
  asking_price: string;
  negotiable: boolean;
  known_faults: string;
  accident_history: string;
  accident_note: string;
  encumbered: boolean;
  service_history: string;
  county: string;
  viewing_area: string;
  description: string;
  auto_share_contact: boolean;
}

export interface SellerEnquiry {
  id: string;
  listing: { id: string; ref: string | null; title: string };
  buyer_name: string;
  message: string;
  viewing_window: string | null;
  status: "new" | "replied" | "closed";
  reply: string | null;
  contact_shared: boolean;
  created_at: string;
  replied_at: string | null;
}

/** Form strings -> the API body: numbers where the contract wants numbers, nulls for blanks. */
export function toBody(v: SaleListingInput) {
  const blank = (s: string) => (s.trim() ? s.trim() : null);
  return {
    ...v,
    year: Number(v.year),
    mileage_km: Number(v.mileage_km.replace(/\D/g, "")),
    engine_cc: v.engine_cc.trim() ? Number(v.engine_cc) : null,
    asking_price: v.asking_price.replace(/\D/g, ""),
    colour: blank(v.colour),
    drive: blank(v.drive),
    accident_note: blank(v.accident_note),
    description: blank(v.description),
  };
}

export function fromListing(l: SaleListing): SaleListingInput {
  return {
    category: l.car.category,
    make: l.car.make,
    model: l.car.model,
    year: String(l.car.year),
    registration: l.car.registration,
    chassis_number: l.car.chassis_number,
    mileage_km: String(l.car.mileage_km),
    engine_cc: l.car.engine_cc ? String(l.car.engine_cc) : "",
    transmission: l.car.transmission,
    fuel: l.car.fuel,
    colour: l.car.colour ?? "",
    drive: l.car.drive ?? "",
    import_status: l.car.import_status,
    asking_price: String(Math.round(l.asking_price.amount / 100)),
    negotiable: l.negotiable,
    known_faults: l.disclosures.known_faults,
    accident_history: l.disclosures.accident_history,
    accident_note: l.disclosures.accident_note ?? "",
    encumbered: l.disclosures.encumbered,
    service_history: l.disclosures.service_history,
    county: l.county,
    viewing_area: l.viewing_area,
    description: l.description ?? "",
    auto_share_contact: l.auto_share_contact,
  };
}

export function kesLine(m: Money): string {
  return `KES ${Math.round(m.amount / 100).toLocaleString("en-KE")}`;
}

type ListResponse = {
  data: SaleListing[];
  counts: { all: number; live: number; needs_action: number; new_enquiries: number };
  seller: { type: "merchant" | "private"; cleared: boolean; reason: string | null; limit: number | null };
};

export const createSaleListing = (input: SaleListingInput & { vehicle_id?: string }) =>
  apiPost<SaleListing>("/me/sale-listings", { ...toBody(input), ...(input.vehicle_id ? { vehicle_id: input.vehicle_id } : {}) });

export function useSaleList() {
  return useQuery({ queryKey: ["sales"], queryFn: () => apiGet<ListResponse>("/me/sale-listings?limit=100") });
}

export function useSaleListing(id: string | undefined) {
  return useQuery({
    queryKey: ["sale", id],
    queryFn: () => apiGet<SaleListing>(`/me/sale-listings/${id}`),
    enabled: !!id,
  });
}

export function useSaleInbox(listingId?: string) {
  return useQuery({
    queryKey: ["sale-inbox", listingId ?? "all"],
    queryFn: () =>
      apiGet<{ data: SellerEnquiry[] }>(`/me/sale-inbox?status=all&limit=100${listingId ? `&listing_id=${listingId}` : ""}`),
  });
}

function useInvalidate(id?: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["sales"] });
    void qc.invalidateQueries({ queryKey: ["sale-inbox"] });
    if (id) void qc.invalidateQueries({ queryKey: ["sale", id] });
    // A sale can pause or retire a fleet car's hire listing.
    void qc.invalidateQueries({ queryKey: ["vehicles"] });
    void qc.invalidateQueries({ queryKey: ["vehicle"] });
  };
}

export function useUpdateSaleListing(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (input: Partial<ReturnType<typeof toBody>>) => apiPatch<SaleListing>(`/me/sale-listings/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useUploadSaleDocument(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (input: { kind: SaleDocKind | "sale_photo"; slot?: PhotoSlot; file: File }) => {
      const form = new FormData();
      form.append("kind", input.kind);
      if (input.slot) form.append("slot", input.slot);
      form.append("file", input.file);
      return apiUpload<SaleListing>(`/me/sale-listings/${id}/documents`, form);
    },
    onSuccess: invalidate,
  });
}

export function useSaleAction(id: string) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (
      a:
        | { kind: "submit" }
        | { kind: "renew" }
        | { kind: "status"; to: "paused" | "live" | "under_offer" | "sold" | "withdrawn"; sold_via_cral?: boolean },
    ) =>
      a.kind === "status"
        ? apiPost<SaleListing>(`/me/sale-listings/${id}/status`, { to: a.to, sold_via_cral: a.sold_via_cral })
        : apiPost<SaleListing>(`/me/sale-listings/${id}/${a.kind}`),
    onSuccess: invalidate,
  });
}

export function useDeleteSaleListing(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: () => apiDelete<void>(`/me/sale-listings/${id}`), onSuccess: invalidate });
}

export function useReplyEnquiry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (a: { id: string; message?: string; share_phone: boolean }) =>
      apiPost<SellerEnquiry>(`/me/sale-inbox/${a.id}/reply`, { message: a.message, share_phone: a.share_phone }),
    onSuccess: invalidate,
  });
}

export function useCloseEnquiry() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => apiPost<SellerEnquiry>(`/me/sale-inbox/${id}/close`), onSuccess: invalidate });
}

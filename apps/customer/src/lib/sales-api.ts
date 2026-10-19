import { apiDelete, apiGet, apiPatch, apiPost } from "./api.js";

/**
 * Car sales on the customer site (docs/plans/car-sales.md):
 * - buying - openapi/sales-catalog.yaml (public browse, signed-in enquire);
 * - selling as a private person - openapi/sales-seller.yaml (the same
 *   seller API the merchant portal uses; a private account may hold two
 *   open listings).
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export interface Money {
  amount: number;
  currency: string;
}

export function kes(m: Money): string {
  return `KES ${Math.round(m.amount / 100).toLocaleString("en-KE")}`;
}

/** A relative photo path from the API turned into a load-able URL. */
export function salePhotoSrc(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export const IMPORT_LABEL: Record<string, string> = {
  foreign_used: "Foreign used",
  locally_used: "Locally used",
  new: "New",
};
export const ACCIDENT_LABEL: Record<string, string> = {
  none: "No accidents",
  minor: "Minor accident (cosmetic)",
  major: "Major accident",
};
export const SERVICE_LABEL: Record<string, string> = {
  full: "Full service history",
  partial: "Partial service history",
  none: "No service history",
};

// ---------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------

export interface SaleSummary {
  ref: string;
  title: string;
  status: "live" | "under_offer";
  category: string;
  make: string;
  model: string;
  year: number;
  mileage_km: number;
  transmission: string;
  fuel: string;
  import_status: string;
  asking_price: Money;
  negotiable: boolean;
  county: string;
  encumbered: boolean;
  accident_history: string;
  cover_url: string | null;
  seller: { name: string; type: "dealer" | "merchant" | "private" };
  live_at: string;
}

export interface SaleDetail extends SaleSummary {
  engine_cc: number | null;
  colour: string | null;
  drive: string | null;
  disclosures: {
    known_faults: string;
    accident_history: string;
    accident_note: string | null;
    encumbered: boolean;
    service_history: string;
  };
  viewing_area: string;
  description: string | null;
  photos: { slot: string; label: string; url: string }[];
  checks: { logbook_checked: boolean; ntsa_search: boolean; bank_clearance_letter: boolean };
  safety_note: string;
}

export interface BrowseFilters {
  q?: string;
  make?: string;
  category?: string;
  county?: string;
  max_price?: string;
  sort?: "newest" | "price_asc" | "price_desc";
  cursor?: string;
}

export function browseSales(f: BrowseFilters) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) params.set(k, v);
  params.set("limit", "24");
  return apiGet<{ data: SaleSummary[]; next_cursor: string | null; has_more: boolean; total: number; facets: { makes: string[] } }>(
    `/sales?${params.toString()}`,
    { auth: false },
  );
}

export const getSale = (ref: string) => apiGet<SaleDetail>(`/sales/${ref}`, { auth: false });

export interface BuyerEnquiry {
  id: string;
  listing: { ref: string | null; title: string; status: string };
  message: string;
  viewing_window: string | null;
  status: "new" | "replied" | "closed";
  reply: string | null;
  seller_phone: string | null;
  created_at: string;
  replied_at: string | null;
}

export const enquire = (ref: string, body: { message: string; viewing_window?: string }) =>
  apiPost<BuyerEnquiry>(`/sales/${ref}/enquiries`, body);
export const reportListing = (ref: string, body: { reason: string; note?: string }) =>
  apiPost<{ reported: true }>(`/sales/${ref}/reports`, body);
export const myEnquiries = () => apiGet<{ data: BuyerEnquiry[] }>("/me/sale-enquiries?limit=100");

// ---------------------------------------------------------------------
// Selling
// ---------------------------------------------------------------------

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

/** What a private seller reads for each status - one word plus a sentence, never colour alone. */
export const SALE_STATUS_LABEL: Record<SaleStatus, { label: string; tone: string; bg: string }> = {
  draft: { label: "Draft", tone: "#5A6373", bg: "#F1F3F6" },
  pending: { label: "Waiting for review", tone: "#8A5200", bg: "#FFF3DB" },
  review: { label: "Being reviewed", tone: "#075D93", bg: "#E1F1FA" },
  action: { label: "Needs a change", tone: "#A50E22", bg: "#FDE7EA" },
  rejected: { label: "Not listed", tone: "#A50E22", bg: "#FDE7EA" },
  live: { label: "For sale", tone: "#076945", bg: "#DDF3E9" },
  paused: { label: "Paused", tone: "#5A6373", bg: "#F1F3F6" },
  under_offer: { label: "Under offer", tone: "#0F23A8", bg: "#EDEFFC" },
  sold: { label: "Sold", tone: "#076945", bg: "#DDF3E9" },
  withdrawn: { label: "Withdrawn", tone: "#5A6373", bg: "#F1F3F6" },
  expired: { label: "Expired", tone: "#8A5200", bg: "#FFF3DB" },
  removed: { label: "Taken down", tone: "#A50E22", bg: "#FDE7EA" },
};

export type PhotoSlot = "front" | "rear" | "left" | "right" | "interior_front" | "interior_rear" | "dashboard" | "engine_bay";
export const PHOTO_SLOTS: PhotoSlot[] = ["front", "rear", "left", "right", "interior_front", "interior_rear", "dashboard", "engine_bay"];
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

export interface DocSlot {
  document_id: string;
  original_name: string;
  review_state: "ok" | "pending" | "expiring" | "rejected";
  review_note: string | null;
}

export interface MyListing {
  id: string;
  ref: string | null;
  title: string;
  status: SaleStatus;
  seller_cleared: boolean;
  seller_gate_reason: string | null;
  car: {
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
  };
  asking_price: Money;
  negotiable: boolean;
  disclosures: SaleDetail["disclosures"];
  county: string;
  viewing_area: string;
  description: string | null;
  auto_share_contact: boolean;
  reviewer_note: string | null;
  documents: {
    logbook: DocSlot | null;
    bank_clearance_letter: DocSlot | null;
    ntsa_search: DocSlot | null;
    photos: Record<PhotoSlot, DocSlot | null>;
  };
  missing_for_submit: string[];
  enquiries: { total: number; new: number };
  view_count: number;
  expires_at: string | null;
  created_at: string;
}

export interface SaleForm {
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
  import_status: string;
  asking_price: string;
  negotiable: boolean;
  known_faults: string;
  accident_history: string;
  encumbered: boolean;
  service_history: string;
  county: string;
  viewing_area: string;
  description: string;
  auto_share_contact: boolean;
}

export const EMPTY_FORM: SaleForm = {
  category: "sedan",
  make: "",
  model: "",
  year: "",
  registration: "",
  chassis_number: "",
  mileage_km: "",
  engine_cc: "",
  transmission: "Automatic",
  fuel: "Petrol",
  import_status: "foreign_used",
  asking_price: "",
  negotiable: true,
  known_faults: "",
  accident_history: "none",
  encumbered: false,
  service_history: "partial",
  county: "",
  viewing_area: "",
  description: "",
  auto_share_contact: false,
};

export function formToBody(f: SaleForm) {
  return {
    ...f,
    year: Number(f.year),
    mileage_km: Number(f.mileage_km.replace(/\D/g, "")),
    engine_cc: f.engine_cc.trim() ? Number(f.engine_cc) : null,
    asking_price: f.asking_price.replace(/\D/g, ""),
    description: f.description.trim() || null,
  };
}

export function listingToForm(l: MyListing): SaleForm {
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
    import_status: l.car.import_status,
    asking_price: String(Math.round(l.asking_price.amount / 100)),
    negotiable: l.negotiable,
    known_faults: l.disclosures.known_faults,
    accident_history: l.disclosures.accident_history,
    encumbered: l.disclosures.encumbered,
    service_history: l.disclosures.service_history,
    county: l.county,
    viewing_area: l.viewing_area,
    description: l.description ?? "",
    auto_share_contact: l.auto_share_contact,
  };
}

export interface SellerEnquiry {
  id: string;
  buyer_name: string;
  message: string;
  viewing_window: string | null;
  status: "new" | "replied" | "closed";
  reply: string | null;
  contact_shared: boolean;
  created_at: string;
}

export const myListings = () =>
  apiGet<{
    data: MyListing[];
    seller: { type: "merchant" | "private"; cleared: boolean; reason: string | null; limit: number | null };
  }>("/me/sale-listings?limit=100");
export const myListing = (id: string) => apiGet<MyListing>(`/me/sale-listings/${id}`);
export const createListing = (f: SaleForm) => apiPost<MyListing>("/me/sale-listings", formToBody(f));
export const updateListing = (id: string, body: Partial<ReturnType<typeof formToBody>>) =>
  apiPatch<MyListing>(`/me/sale-listings/${id}`, body);
export const deleteListing = (id: string) => apiDelete<void>(`/me/sale-listings/${id}`);
export const submitListing = (id: string) => apiPost<MyListing>(`/me/sale-listings/${id}/submit`);
export const renewListing = (id: string) => apiPost<MyListing>(`/me/sale-listings/${id}/renew`);
export const setListingStatus = (id: string, to: "paused" | "live" | "under_offer" | "sold" | "withdrawn", soldViaCral?: boolean) =>
  apiPost<MyListing>(`/me/sale-listings/${id}/status`, { to, sold_via_cral: soldViaCral });
export function uploadListingFile(id: string, kind: "logbook" | "bank_clearance_letter" | "ntsa_search" | "sale_photo", file: File, slot?: PhotoSlot) {
  const formData = new FormData();
  formData.append("kind", kind);
  if (slot) formData.append("slot", slot);
  formData.append("file", file);
  return apiPost<MyListing>(`/me/sale-listings/${id}/documents`, undefined, { formData });
}
export const listingInbox = (id: string) => apiGet<{ data: SellerEnquiry[] }>(`/me/sale-inbox?status=all&limit=100&listing_id=${id}`);
export const replyEnquiry = (id: string, body: { message?: string; share_phone: boolean }) =>
  apiPost<SellerEnquiry>(`/me/sale-inbox/${id}/reply`, body);
export const closeEnquiry = (id: string) => apiPost<SellerEnquiry>(`/me/sale-inbox/${id}/close`);

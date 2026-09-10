import { apiGet } from "./api.js";

/**
 * Typed client for the public catalog (`openapi/customer-catalog.yaml`).
 * Every call is anonymous - `auth: false` so no bearer header is attached
 * and a stale token can't turn a public read into a 401.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export interface Money {
  amount: number;
  currency: string;
}

export interface CatalogOwner {
  display_name: string;
  since: string;
  listed_count: number;
}

export interface CatalogVehicleSummary {
  id: string;
  listing_ref: string | null;
  make: string;
  model: string;
  year: string;
  category: "sedan" | "suv" | "van" | "truck" | "machinery";
  registration: string;
  transmission: string;
  fuel: string;
  colour: string | null;
  seats: number;
  chauffeured: boolean;
  county: string | null;
  daily_rate: Money;
  verified: boolean;
  primary_photo_url: string | null;
  owner: CatalogOwner;
  created_at: string;
}

export interface CatalogVehicleDetail extends CatalogVehicleSummary {
  minimum_hire_days: number;
  photo_urls: string[];
}

export interface CatalogCollection {
  key: string;
  kicker: string;
  title: string;
  sub: string;
  vehicles: CatalogVehicleSummary[];
}

export interface CatalogPage {
  data: CatalogVehicleSummary[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface CatalogSearchParams {
  county?: string;
  from?: string;
  to?: string;
  category?: CatalogVehicleSummary["category"];
  max_price?: number;
  seats_min?: number;
  transmission?: "automatic" | "manual";
  chauffeured?: boolean;
  sort?: "recommended" | "price_asc" | "price_desc" | "newest";
  cursor?: string;
  limit?: number;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}

export function searchCatalog(params: CatalogSearchParams): Promise<CatalogPage> {
  return apiGet<CatalogPage>(`/catalog/vehicles${qs({ ...params })}`, { auth: false });
}

export function getCatalogVehicle(id: string): Promise<CatalogVehicleDetail> {
  return apiGet<CatalogVehicleDetail>(`/catalog/vehicles/${encodeURIComponent(id)}`, {
    auth: false,
  });
}

export function getCollections(): Promise<{ collections: CatalogCollection[] }> {
  return apiGet<{ collections: CatalogCollection[] }>("/catalog/collections", { auth: false });
}

/** A relative photo path from the API turned into a load-able URL. */
export function photoSrc(relativePath: string): string {
  return `${API_BASE_URL}${relativePath}`;
}

/** "KES 4,200" - display formatting is the client's job (spec §2). */
export function formatMoney(m: Money): string {
  return `${m.currency} ${Math.round(m.amount / 100).toLocaleString("en-KE")}`;
}

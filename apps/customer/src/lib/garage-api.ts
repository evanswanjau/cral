import { apiDelete, apiGet, apiPatch, apiPost } from "./api.js";
import type { Money } from "./catalog-api.js";

/**
 * "My cars" and garage quote requests (Phase 4 GS2,
 * `openapi/customer-garage.yaml`). Nothing here moves money: accepting and
 * paying a quote is GS3.
 */

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

export const LINE_LABELS: Record<string, string> = { part: "Part", labour: "Labour", delivery: "Delivery", other: "Other" };

export interface CarInput {
  make: string;
  model: string;
  year: number;
  plate: string;
  chassis_number: string | null;
}

export interface Car extends CarInput {
  id: string;
  created_at: string;
}

export interface GarageQuote {
  id: string;
  outlet: { id: string; name: string; county: string; address: string; visited_on: string | null } | null;
  lines: Array<{ kind: string; description: string; amount: Money }>;
  total: Money;
  days_needed: number;
  note: string | null;
  sent_at: string;
  valid_until: string;
  expired: boolean;
}

export interface GarageRequest {
  id: string;
  car: Car | null;
  service_type: ServiceType;
  description: string;
  county: string;
  status: "open" | "cancelled" | "accepted";
  garages_asked: number;
  garages_declined: number;
  quote_count: number;
  quotes?: GarageQuote[];
  created_at: string;
}

export interface GarageRequestInput {
  car_id: string;
  service_type: ServiceType;
  description: string;
  county: string;
}

export const listCars = () => apiGet<{ data: Car[] }>("/me/cars?limit=100");
export const createCar = (input: CarInput) => apiPost<Car>("/me/cars", input);
export const updateCar = (id: string, input: CarInput) => apiPatch<Car>(`/me/cars/${id}`, input);
export const deleteCar = (id: string) => apiDelete<void>(`/me/cars/${id}`);

export const listGarageRequests = () => apiGet<{ data: GarageRequest[] }>("/me/garage-requests?limit=50");
export const getGarageRequest = (id: string) => apiGet<GarageRequest>(`/me/garage-requests/${id}`);
export const createGarageRequest = (input: GarageRequestInput) => apiPost<GarageRequest>("/me/garage-requests", input);
export const cancelGarageRequest = (id: string) => apiPost<GarageRequest>(`/me/garage-requests/${id}/cancel`);

export function kesText(m: Money): string {
  return `KES ${(m.amount / 100).toLocaleString("en-KE")}`;
}

export function carName(c: Pick<Car, "year" | "make" | "model">): string {
  return `${c.year} ${c.make} ${c.model}`;
}

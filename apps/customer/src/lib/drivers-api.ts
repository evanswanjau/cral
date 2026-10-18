import { apiGet } from "./api.js";
import type { Money } from "./catalog-api.js";

/**
 * Drivers for hire (docs/plans/drivers.md) - the public catalog side,
 * `openapi/customer-catalog.yaml`. A thin projection: first name and
 * surname initial, county, rates, and who they drive for.
 */

export type DriverUnit = "day" | "hour" | "trip";

export interface PublicDriver {
  id: string;
  display_name: string;
  county: string;
  rates: { day: Money | null; hour: Money | null; trip: Money | null };
  merchant_id: string;
  merchant_name: string;
}

export function listDrivers(county?: string) {
  const q = new URLSearchParams({ limit: "100" });
  if (county) q.set("county", county);
  return apiGet<{ data: PublicDriver[]; has_more: boolean; next_cursor: string | null }>(`/catalog/drivers?${q.toString()}`);
}

export function getDriver(id: string) {
  return apiGet<PublicDriver>(`/catalog/drivers/${id}`);
}

export function driversForCar(vehicleId: string) {
  return apiGet<{ data: PublicDriver[] }>(`/catalog/vehicles/${vehicleId}/drivers`);
}

export const UNIT_WORD: Record<DriverUnit, string> = { day: "day", hour: "hour", trip: "trip" };

/** "KES 3,000 / day · KES 500 / hour" - only the rates the driver offers. */
export function rateLine(d: PublicDriver): string {
  const fmt = (m: Money) => `KES ${(m.amount / 100).toLocaleString("en-KE")}`;
  return (["day", "hour", "trip"] as const)
    .filter((u) => d.rates[u])
    .map((u) => `${fmt(d.rates[u]!)} / ${UNIT_WORD[u]}`)
    .join(" · ");
}

/**
 * The driver's part of a quote, in cents - the same rules the server
 * prices on (inclusive days, hours rounded up, a flat trip). Shown before
 * sending; the server's own figure is what is charged.
 */
export function driverQuote(d: PublicDriver, unit: DriverUnit, days: number, hours: number): number | null {
  const rate = d.rates[unit];
  if (!rate) return null;
  if (unit === "trip") return rate.amount;
  if (unit === "hour") return hours > 0 ? rate.amount * hours : null;
  return days > 0 ? rate.amount * days : null;
}

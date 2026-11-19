/**
 * The merchant portal's sections, by what the merchant offers
 * (docs/plans/ui-services-proposal.md section 4.6, portal nav table).
 * Pure: everything comes from data `AppLayout` already loads, so nothing
 * new is stored or fetched.
 *
 * - Vehicles shows when there are vehicles, or the merchant isn't
 *   driver-only. Its label follows the fleet: "Trucks" when every vehicle
 *   is a truck, "Machinery" when every one is machinery, else "Vehicles".
 * - Drivers always shows; for a driver-only merchant it comes second.
 * - Premises (Phase 4 GS1) shows when the merchant has premises or said
 *   they offer garage services. A garage-only merchant with no vehicles
 *   gets no Vehicles item.
 * - Cars for sale (Phase 6 CS1) shows when the merchant has a sale listing
 *   or said they sell cars. A sells-only merchant with no vehicles gets no
 *   Vehicles item either.
 */

export type FleetWord = { label: string; one: string; many: string };

export const FLEET_WORDS = {
  vehicles: { label: "Vehicles", one: "vehicle", many: "vehicles" },
  trucks: { label: "Trucks", one: "truck", many: "trucks" },
  machinery: { label: "Machinery", one: "machine", many: "machines" },
} satisfies Record<string, FleetWord>;

export type FleetKind = keyof typeof FLEET_WORDS;

export interface OfferingInput {
  /** `vehicles.counts.all`. */
  vehicleCount: number;
  /** Categories (`type`) of the vehicles loaded. */
  vehicleTypes: string[];
  /** True when `vehicleTypes` covers every vehicle (no further page). */
  allTypesKnown: boolean;
  driversOnly: boolean;
  /** Signed up for garage services only (`garage_only`). */
  garageOnly: boolean;
  /** Has premises, or picked garage services: show "Premises". */
  showPremises: boolean;
  /** Signed up to sell cars only (`sells_only`). */
  sellsOnly: boolean;
  /** Has a sale listing, or picked selling cars: show "Cars for sale". */
  showSales: boolean;
}

/** Trucks / Machinery only when every vehicle is known to be that kind. */
export function fleetKind(input: OfferingInput): FleetKind {
  const { vehicleTypes, allTypesKnown, vehicleCount } = input;
  if (vehicleCount === 0 || !allTypesKnown || vehicleTypes.length === 0) return "vehicles";
  if (vehicleTypes.every((t) => t === "truck")) return "trucks";
  if (vehicleTypes.every((t) => t === "machinery")) return "machinery";
  return "vehicles";
}

/** No vehicles and signed up to drive only: nothing about vehicles is shown. */
export function isDriverOnly(input: Pick<OfferingInput, "vehicleCount" | "driversOnly">): boolean {
  return input.driversOnly && input.vehicleCount === 0;
}

export type NavKey = "dashboard" | "vehicles" | "drivers" | "premises" | "quotes" | "garage-jobs" | "sales" | "bookings" | "payouts" | "notifications" | "settings";

export interface NavItem {
  key: NavKey;
  to: string;
  label: string;
  /** Badge number; omitted when the item carries none. */
  count?: number;
}

export interface NavCounts {
  driverActionCount: number;
  bookingCount: number;
  notificationUnread: number;
  /** Premises sent back or turned down. */
  premisesActionCount?: number;
  /** Garage requests waiting for this merchant's price (GS2). */
  quoteRequestCount?: number;
  /** Paid garage jobs waiting to be started (GS3). */
  garageJobCount?: number;
  /** Sale listings sent back or turned down (CS1). */
  saleActionCount?: number;
}

export function navSections(input: OfferingInput, counts: NavCounts): NavItem[] {
  const items: NavItem[] = [{ key: "dashboard", to: "/", label: "Dashboard" }];
  const drivers: NavItem = {
    key: "drivers",
    to: "/drivers",
    label: "Drivers",
    ...(counts.driverActionCount > 0 ? { count: counts.driverActionCount } : {}),
  };
  const premises: NavItem = {
    key: "premises",
    to: "/premises",
    label: "Premises",
    ...(counts.premisesActionCount ? { count: counts.premisesActionCount } : {}),
  };
  // Quote requests sit right after Premises (Phase 4 GS2).
  const quotes: NavItem = {
    key: "quotes",
    to: "/garage/requests",
    label: "Quote requests",
    ...(counts.quoteRequestCount ? { count: counts.quoteRequestCount } : {}),
  };
  // Garage jobs follow quote requests (Phase 4 GS3).
  const jobs: NavItem = {
    key: "garage-jobs",
    to: "/garage/orders",
    label: "Jobs and orders",
    ...(counts.garageJobCount ? { count: counts.garageJobCount } : {}),
  };
  const sales: NavItem = {
    key: "sales",
    to: "/sales",
    label: "Cars for sale",
    ...(counts.saleActionCount ? { count: counts.saleActionCount } : {}),
  };
  const withSales = input.showSales ? [sales] : [];
  const garageOnly = input.garageOnly && input.vehicleCount === 0;
  const sellsOnly = input.sellsOnly && input.vehicleCount === 0;
  if (garageOnly) {
    items.push(premises, quotes, jobs, ...withSales, drivers);
  } else if (sellsOnly) {
    items.push(sales, drivers);
    if (input.showPremises) items.push(premises, quotes, jobs);
  } else if (isDriverOnly(input)) {
    items.push(drivers);
    if (input.showPremises) items.push(premises, quotes, jobs);
    items.push(...withSales);
  } else {
    items.push({ key: "vehicles", to: "/vehicles", label: FLEET_WORDS[fleetKind(input)].label, count: input.vehicleCount });
    items.push(drivers);
    if (input.showPremises) items.push(premises, quotes, jobs);
    items.push(...withSales);
  }
  items.push(
    { key: "bookings", to: "/bookings", label: "Bookings", count: counts.bookingCount },
    { key: "payouts", to: "/payouts", label: "Payouts" },
    {
      key: "notifications",
      to: "/notifications",
      label: "Notifications",
      ...(counts.notificationUnread > 0 ? { count: counts.notificationUnread } : {}),
    },
    { key: "settings", to: "/settings", label: "Settings" },
  );
  return items;
}

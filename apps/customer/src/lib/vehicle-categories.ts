/**
 * Vehicle category vocabulary for the customer portal - the client mirror
 * of `apps/api/src/modules/vehicles/categories.ts` (owner's call,
 * 2026-08-31). Same list `apps/merchant/src/lib/vehicle-categories.ts`
 * carries; keep all three in step.
 */
export const VEHICLE_CATEGORIES = [
  { value: "sedan", label: "Sedan / small cars" },
  { value: "suv", label: "SUV / 4x4 / Pickup" },
  { value: "van", label: "Van / Minibus" },
  { value: "truck", label: "Truck & trailers" },
  { value: "machinery", label: "Construction & machinery" },
] as const;

export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number]["value"];

export const VEHICLE_CATEGORY_LABEL = Object.fromEntries(
  VEHICLE_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<VehicleCategory, string>;

/**
 * Truck sub-types (owner's call, 2026-11-10 - PR T1 of
 * `docs/plans/trucks-and-sales-agents.md`). Client mirror of
 * `TRUCK_TYPES` in `apps/api/src/modules/vehicles/categories.ts` - keep
 * them in step. Only meaningful when the category is `truck`.
 */
export const TRUCK_TYPES = [
  { value: "pickup", label: "Pickup" },
  { value: "canter", label: "Canter / light truck" },
  { value: "box_body", label: "Box body" },
  { value: "flatbed", label: "Flatbed" },
  { value: "tipper", label: "Tipper" },
  { value: "refrigerated", label: "Refrigerated" },
  { value: "water_bowser", label: "Water bowser" },
  { value: "prime_mover", label: "Prime mover + trailer" },
  { value: "low_loader", label: "Low-loader" },
  { value: "crane_truck", label: "Crane truck" },
] as const;

export type TruckType = (typeof TRUCK_TYPES)[number]["value"];

/** How a stored truck-type slug reads on a screen; tolerates an unknown value. */
export function truckTypeLabel(value: string | null | undefined): string {
  if (!value) return "";
  return TRUCK_TYPES.find((t) => t.value === value)?.label ?? value;
}

/** Kilograms -> "4 t" / "1.5 t". The API stores kg; people think in tonnes. */
export function formatPayload(kg: number | null | undefined): string {
  if (!kg) return "";
  const t = kg / 1000;
  return `${Number.isInteger(t) ? t : t.toFixed(1).replace(/\.0$/, "")} t`;
}

/**
 * The short spec line a card and the car page both show, before "With
 * driver / Self-drive". A truck reads by what it is and what it carries
 * ("Tipper · carries 14 t") - seats and gearbox are not how anyone picks a
 * truck. One helper so the two screens can't word a car differently.
 */
export function specLine(car: {
  category: string;
  truck_type: string | null;
  payload_kg: number | null;
  seats: number;
  transmission: string;
}): string {
  if (car.category === "truck" && (car.truck_type || car.payload_kg)) {
    return [truckTypeLabel(car.truck_type), car.payload_kg ? `carries ${formatPayload(car.payload_kg)}` : ""]
      .filter(Boolean)
      .join(" · ");
  }
  return `${car.seats} seats · ${car.transmission === "manual" ? "Manual" : "Auto"}`;
}

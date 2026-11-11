/**
 * Vehicle category vocabulary for the merchant portal - the client mirror
 * of `apps/api/src/modules/vehicles/categories.ts` (owner's call,
 * 2026-08-31, replacing the old Car / SUV / Van / Pickup / Lorry list).
 * Keep the two in step.
 */
export const VEHICLE_CATEGORIES = [
  { value: "sedan", label: "Sedan / small cars" },
  { value: "suv", label: "SUV / 4x4 / Pickup" },
  { value: "van", label: "Van / Minibus" },
  { value: "truck", label: "Truck & trailers" },
  { value: "machinery", label: "Construction & machinery" },
] as const;

export type VehicleType = (typeof VEHICLE_CATEGORIES)[number]["value"];

export const VEHICLE_CATEGORY_LABEL = Object.fromEntries(
  VEHICLE_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<VehicleType, string>;

/** How a stored category slug reads on a screen; tolerates a legacy/unknown value. */
export function vehicleTypeLabel(value: string): string {
  return VEHICLE_CATEGORY_LABEL[value as VehicleType] ?? value;
}

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

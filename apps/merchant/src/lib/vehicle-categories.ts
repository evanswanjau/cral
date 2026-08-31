/**
 * Vehicle category vocabulary for the merchant portal — the client mirror
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

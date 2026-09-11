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

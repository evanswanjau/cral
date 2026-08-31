/**
 * The vehicle category vocabulary, shared by the onboarding flow
 * (`modules/merchant`) and the post-onboarding vehicles module. Replaces
 * the earlier `Car | SUV | Van | Pickup | Lorry` list (owner's call,
 * 2026-08-31) — the mirror on the client is
 * `apps/merchant/src/lib/vehicle-categories.ts`, keep the two in step.
 */
export const VEHICLE_CATEGORIES = ["sedan", "suv", "van", "truck", "machinery"] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export const VEHICLE_CATEGORY_LABELS: Record<VehicleCategory, string> = {
  sedan: "Sedan / small cars",
  suv: "SUV / 4x4 / Pickup",
  van: "Van / Minibus",
  truck: "Truck & trailers",
  machinery: "Construction & machinery",
};

/**
 * Old free-text `vehicles.type` values → new category slugs. Used by
 * migration `20260831090100` and kept here so the mapping has one home.
 * Nothing maps to `machinery` — it is a genuinely new option.
 */
export const LEGACY_TYPE_REMAP: Record<string, VehicleCategory> = {
  Car: "sedan",
  SUV: "suv",
  Pickup: "suv",
  Van: "van",
  Lorry: "truck",
};

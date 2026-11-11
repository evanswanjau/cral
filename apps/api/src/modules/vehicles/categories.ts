import { ApiError } from "@cral/types";

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
 * Truck sub-types (owner's call, 2026-11-10 - PR T1 of
 * `docs/plans/trucks-and-sales-agents.md`). Only set when the category is
 * `truck`. Repeated in migration `20261110090000`'s CHECK and mirrored in
 * the merchant + customer `vehicle-categories.ts` - keep all four in step.
 */
export const TRUCK_TYPES = [
  "pickup",
  "canter",
  "box_body",
  "flatbed",
  "tipper",
  "refrigerated",
  "water_bowser",
  "prime_mover",
  "low_loader",
  "crane_truck",
] as const;
export type TruckType = (typeof TRUCK_TYPES)[number];

/** Largest payload we accept, in kg - a 100 t ceiling catches a typo'd extra zero. */
export const MAX_PAYLOAD_KG = 100_000;

/**
 * The truck columns for a write, given the category the vehicle will have
 * afterwards. A non-truck never keeps truck fields, so switching a draft
 * from `truck` to `van` clears them rather than leaving stale values the
 * catalog filter would still match. `undefined` means "leave as is".
 */
export function truckColumns(
  category: string | undefined,
  input: { truck_type?: TruckType | null | undefined; payload_kg?: number | null | undefined },
): { truck_type?: TruckType | null; payload_kg?: number | null } {
  if (category !== undefined && category !== "truck") return { truck_type: null, payload_kg: null };
  const out: { truck_type?: TruckType | null; payload_kg?: number | null } = {};
  if (input.truck_type !== undefined) out.truck_type = input.truck_type;
  if (input.payload_kg !== undefined) out.payload_kg = input.payload_kg;
  return out;
}

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

/**
 * Submission gate for the truck fields: a truck can't go to review without
 * its type and capacity, since those are what a renter filters on. Shared
 * by `submitVehicle` and onboarding's `assertCompleteForSubmission`.
 */
export function assertTruckDetails(vehicle: {
  type: string;
  truck_type: string | null;
  payload_kg: number | null;
  registration?: string;
}): void {
  if (vehicle.type !== "truck") return;
  if (!vehicle.truck_type || !vehicle.payload_kg) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "truck_details_required",
      message: `Add the truck type and how much it carries${
        vehicle.registration ? ` for ${vehicle.registration}` : ""
      } before submitting.`,
      field: vehicle.truck_type ? "payload_kg" : "truck_type",
    });
  }
}

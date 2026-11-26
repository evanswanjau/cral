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

/**
 * Machine sub-types (owner's decision 4, 2026-11-26 - PR H1 of
 * `docs/plans/hire-that-works.md`). Client mirror of `MACHINE_TYPES` in
 * `apps/api/src/modules/vehicles/categories.ts` - keep them in step. Only
 * meaningful when the category is `machinery`.
 */
export const MACHINE_TYPES = [
  { value: "excavator", label: "Excavator" },
  { value: "backhoe_loader", label: "Backhoe loader" },
  { value: "wheel_loader", label: "Wheel loader" },
  { value: "skid_steer", label: "Skid steer" },
  { value: "bulldozer", label: "Bulldozer" },
  { value: "grader", label: "Grader" },
  { value: "roller", label: "Roller / compactor" },
  { value: "forklift", label: "Forklift" },
  { value: "telehandler", label: "Telehandler" },
  { value: "mobile_crane", label: "Mobile crane" },
  { value: "concrete_mixer", label: "Concrete mixer" },
  { value: "other", label: "Other machine" },
] as const;

export type MachineType = (typeof MACHINE_TYPES)[number]["value"];

/** How a stored machine-type slug reads on a screen; tolerates an unknown value. */
export function machineTypeLabel(value: string | null | undefined): string {
  if (!value) return "";
  return MACHINE_TYPES.find((t) => t.value === value)?.label ?? value;
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
  machine_type?: string | null;
}): string {
  // Machinery is picked by what it is (PR H3: its machine type), never by
  // seats or gearbox.
  if (car.category === "machinery") return machineTypeLabel(car.machine_type) || "Machine";
  // A truck is never described by seats or gearbox, even with no type set.
  if (car.category === "truck") {
    return [truckTypeLabel(car.truck_type), car.payload_kg ? `carries ${formatPayload(car.payload_kg)}` : ""]
      .filter(Boolean)
      .join(" · ");
  }
  return `${car.seats} seats · ${car.transmission === "manual" ? "Manual" : "Auto"}`;
}

/**
 * The hire groups (PR H1): what `group=` on the catalog takes. "Cars" is
 * sedan + SUV + van; mirror of `HIRE_GROUPS` in the API's `categories.ts`.
 */
export const HIRE_GROUPS = {
  cars: ["sedan", "suv", "van"],
  trucks: ["truck"],
  machinery: ["machinery"],
} as const;
export type HireGroup = keyof typeof HIRE_GROUPS;

/**
 * Where a listing lives on the site: trucks and machinery each have a
 * sub-site of their own (UI2a, UI2b), everything else is a car. The
 * detail page is `${base}/:id`; the booking is `${base}/:id/request` for a
 * truck and `${base}/:id/book` otherwise.
 */
export function listingBase(category: string): "/trucks" | "/machinery" | "/cars" {
  if (category === "truck") return "/trucks";
  if (category === "machinery") return "/machinery";
  return "/cars";
}

/**
 * Who comes with the hire, as the card and the detail page say it (PR H3):
 * a car is "With driver" or "Self-drive"; a truck "With driver" or
 * nothing; a machine "With operator" or nothing. Trucks and machines are
 * never called self-drive.
 */
export function crewNote(car: { category: string; chauffeured: boolean }): string {
  if (car.category === "machinery") return car.chauffeured ? "With operator" : "";
  if (car.category === "truck") return car.chauffeured ? "With driver" : "";
  return car.chauffeured ? "With driver" : "Self-drive";
}

/** Cars are picked by seats and offered self-drive; trucks and machinery are not. */
export function isCarCategory(category: string): boolean {
  return category !== "truck" && category !== "machinery";
}

/** "car", "truck" or "machine": the noun for a listing in running copy
 * (UI7), so a truck booking isn't told "the car is yours". */
export function vehicleNoun(category: string): "car" | "truck" | "machine" {
  if (category === "truck") return "truck";
  if (category === "machinery") return "machine";
  return "car";
}

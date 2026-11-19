/**
 * What a merchant offers on CRAL, as onboarding step 1 ("What do you
 * offer?") picks it. Derived, never stored server-side: the recorded "no
 * `offers` column" decision (`docs/decisions/merchant-portal.md`) holds.
 *
 * - On load the choice comes from the draft: each vehicle's category
 *   (sedan/suv/van -> cars, truck -> trucks, machinery -> machinery) and
 *   `drivers_only` (-> drivers).
 * - What the merchant ticked is also kept in this device's localStorage,
 *   keyed by user, the same offline buffer the onboarding draft uses, so
 *   a pick with no vehicle behind it yet survives leaving and coming back.
 * - On a first visit with nothing else to go on, `?offer=` from
 *   `/create-account` (kept by `rememberOffer`) pre-selects one.
 *
 * Two values reach the server, through the existing onboarding PATCH:
 * picking Driving alone sets `drivers_only: true`, and picking Garage
 * services alone sets `garage_only: true` (Phase 4 GS1). Garage services
 * isn't a `SupplierType`: its `/join/garages` page (GS4) is its own page,
 * and its `?offer=garage` link pre-selects it here.
 *
 * Spare parts (Phase 5 PT1) is the same kind of offer as garage services:
 * premises, no vehicle. Picked alone, or with garage services and nothing
 * else, it also sets `garage_only` (which means "premises only" on the
 * server; no new column). Submitting then lands on `/premises/new`,
 * pre-set to a parts shop when parts was picked without garage services.
 *
 * Selling cars (Phase 6 CS1) needs no vehicle step either: the car is a
 * sale listing added in the portal. Picked with nothing that needs a
 * fleet, it sets `sells_only: true`; picked with garage or parts, both
 * flags are set. Submitting with selling alone lands on `/sales/new`.
 */

import { getCurrentUserId } from "./auth.js";
import type { OnboardingDraft } from "./onboarding-draft.js";
import { readRememberedOffer, SUPPLIER_TYPES, type SupplierType } from "./supplier-types.js";
import type { VehicleType } from "./vehicle-categories.js";

export type Offer = SupplierType | "garage" | "parts" | "selling";

/** Step 1's order: the four supplier types, then garage services, spare parts and selling cars. */
export const OFFER_ORDER: readonly Offer[] = [...SUPPLIER_TYPES, "garage", "parts", "selling"];

/** Offers served from premises rather than vehicles or drivers. */
export const PREMISES_OFFERS: readonly Offer[] = ["garage", "parts"];
export const isPremisesOffer = (o: Offer): boolean => PREMISES_OFFERS.includes(o);

/** Offers that need no vehicle in onboarding: premises, and selling cars (listed in the portal). */
export const isNoFleetOffer = (o: Offer): boolean => isPremisesOffer(o) || o === "selling";

const CATEGORY_OFFER: Record<VehicleType, Offer> = {
  sedan: "cars",
  suv: "cars",
  van: "cars",
  truck: "trucks",
  machinery: "machinery",
};

/** Keeps `SUPPLIER_TYPES` order and drops duplicates. */
function ordered(offers: Iterable<Offer>): Offer[] {
  const set = new Set(offers);
  return OFFER_ORDER.filter((t) => set.has(t));
}

export function offerForCategory(type: VehicleType): Offer {
  return CATEGORY_OFFER[type] ?? "cars";
}

/** Offers the draft itself proves: its vehicles' categories, plus drivers when `driversOnly`. */
export function derivedOffers(draft: OnboardingDraft): Offer[] {
  const out: Offer[] = draft.vehicles.map((v) => offerForCategory(v.type));
  if (draft.driversOnly) out.push("drivers");
  if (draft.garageOnly) out.push("garage");
  if (draft.sellsOnly) out.push("selling");
  return ordered(out);
}

const KEY_PREFIX = "cral-merchant-offers-v1";

function storageKey(): string {
  const userId = getCurrentUserId();
  return userId ? `${KEY_PREFIX}:${userId}` : KEY_PREFIX;
}

function readPicked(): Offer[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return ordered(parsed.filter((x): x is Offer => (OFFER_ORDER as readonly unknown[]).includes(x)));
  } catch {
    return null;
  }
}

export function rememberPickedOffers(offers: Offer[]): void {
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(ordered(offers)));
  } catch {
    // Storage blocked: the choice is still derived from the draft next time.
  }
}

/** The choice to show when the wizard loads. */
export function initialOffers(draft: OnboardingDraft): Offer[] {
  const derived = derivedOffers(draft);
  const picked = readPicked();
  if (picked && picked.length > 0) {
    // A saved Driving-only pick that the draft no longer agrees with
    // (another device added a vehicle) gives way to the vehicles.
    const stale = draft.vehicles.length > 0 && isDriversOnlyChoice(picked);
    // `garage_only` also stands for parts only: trust the pick over it.
    const fromDraft = picked.includes("parts") && !picked.includes("garage") ? derived.filter((o) => o !== "garage") : derived;
    return stale ? derived : ordered([...fromDraft, ...picked]);
  }
  if (derived.length > 0) return derived;
  const fromLink = readRememberedOffer();
  return fromLink ? [fromLink] : [];
}

/** Driving and nothing else: no vehicle step, no vehicle documents. */
export function isDriversOnlyChoice(offers: Offer[]): boolean {
  return offers.length === 1 && offers[0] === "drivers";
}

/** Only offers that need no vehicle, at least one of them premises: premises come after submit. */
export function isGarageOnlyChoice(offers: Offer[]): boolean {
  return offers.length > 0 && offers.every(isNoFleetOffer) && offers.some(isPremisesOffer);
}

/** Selling cars and nothing that needs a vehicle: no vehicle step (Phase 6 CS1). */
export function isSellsOnlyChoice(offers: Offer[]): boolean {
  return offers.includes("selling") && offers.every(isNoFleetOffer);
}

/**
 * Whether this merchant said they sell cars: the server's `sells_only`, or
 * a pick kept on this device. Drives the portal's "Cars for sale" item
 * before any listing exists.
 */
export function offersSelling(sellsOnly: boolean): boolean {
  return sellsOnly || (readPicked() ?? []).includes("selling");
}

/**
 * Whether this merchant said they offer garage services: the server's
 * `garage_only`, or a pick kept on this device. Drives the portal's
 * "Premises" nav item before any premises exist.
 */
export function offersGarage(garageOnly: boolean): boolean {
  return garageOnly || (readPicked() ?? []).some(isPremisesOffer);
}

/** Offers that can't be unticked because a vehicle of that kind is already added. */
export function lockedOffers(draft: OnboardingDraft): Set<Offer> {
  return new Set(draft.vehicles.map((v) => offerForCategory(v.type)));
}

export type FleetKind = "vehicles" | "trucks" | "machinery" | "drivers" | "premises" | "sales";

/**
 * What step 3 is about. With vehicles added, it follows them: every one a
 * truck -> trucks, every one machinery -> machinery. Before any are added
 * it follows the choice.
 */
export function fleetKind(draft: OnboardingDraft, offers: Offer[]): FleetKind {
  if (draft.vehicles.length > 0) {
    if (draft.vehicles.every((v) => v.type === "truck")) return "trucks";
    if (draft.vehicles.every((v) => v.type === "machinery")) return "machinery";
    return "vehicles";
  }
  if (draft.driversOnly || isDriversOnlyChoice(offers)) return "drivers";
  if (draft.garageOnly || isGarageOnlyChoice(offers)) return "premises";
  if (draft.sellsOnly || isSellsOnlyChoice(offers)) return "sales";
  const vehicleOffers = offers.filter((o) => o !== "drivers" && !isNoFleetOffer(o));
  if (vehicleOffers.length === 1 && vehicleOffers[0] === "trucks") return "trucks";
  if (vehicleOffers.length === 1 && vehicleOffers[0] === "machinery") return "machinery";
  return "vehicles";
}

export const FLEET_WORDS: Record<FleetKind, { step: string; one: string; many: string }> = {
  vehicles: { step: "Vehicles", one: "vehicle", many: "vehicles" },
  trucks: { step: "Trucks", one: "truck", many: "trucks" },
  machinery: { step: "Machinery", one: "machine", many: "machines" },
  drivers: { step: "Drivers", one: "driver", many: "drivers" },
  premises: { step: "Premises", one: "premises", many: "premises" },
  sales: { step: "Cars for sale", one: "car", many: "cars" },
};

/** The category a new vehicle form opens on. */
export function defaultCategory(offers: Offer[]): VehicleType {
  if (offers.includes("cars")) return "sedan";
  if (offers.includes("trucks")) return "truck";
  if (offers.includes("machinery")) return "machinery";
  return "sedan";
}

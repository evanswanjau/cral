import { useQuery } from "@tanstack/react-query";
import { loadDraftFromServer } from "./onboarding-draft.js";
import { useVehicleList } from "./vehicles-api.js";
import { useDriverList } from "./drivers-api.js";
import { useOutletList } from "./outlets-api.js";
import { offersGarage } from "./onboarding-offer.js";
import { FLEET_WORDS, fleetKind, isDriverOnly, type FleetWord, type OfferingInput } from "../components/portal/nav-sections.js";

export type Offering = OfferingInput & {
  /** No vehicles and drivers only: hide everything about vehicles. */
  driverOnly: boolean;
  /** How this merchant's fleet is named: vehicles, trucks or machines. */
  fleet: FleetWord;
  /** Drivers on the account (any status). */
  driverCount: number;
  /** Premises sent back or turned down. */
  premisesActionCount: number;
};

/**
 * What the merchant offers, from queries the portal shell already runs
 * (the vehicle and driver lists and the ["onboarding"] draft), so it costs no new
 * request. See `components/portal/nav-sections.ts`.
 */
export function useOffering(): Offering {
  const { data: draft } = useQuery({ queryKey: ["onboarding"], queryFn: loadDraftFromServer });
  const { data: vehicles } = useVehicleList("all");
  const { data: drivers } = useDriverList();
  const { data: outlets } = useOutletList();
  const garageOnly = draft?.garageOnly ?? false;
  const input: OfferingInput = {
    vehicleCount: vehicles?.counts.all ?? 0,
    vehicleTypes: vehicles?.data.map((v) => v.type) ?? [],
    allTypesKnown: Boolean(vehicles) && !vehicles?.has_more,
    driversOnly: draft?.driversOnly ?? false,
    garageOnly,
    showPremises: (outlets?.counts.all ?? 0) > 0 || offersGarage(garageOnly),
  };
  return {
    ...input,
    driverOnly: isDriverOnly(input),
    fleet: FLEET_WORDS[fleetKind(input)],
    driverCount: drivers?.counts.all ?? 0,
    premisesActionCount: outlets?.counts.needs_action ?? 0,
  };
}

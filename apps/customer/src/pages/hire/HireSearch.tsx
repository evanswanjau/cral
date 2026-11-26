import { useSearchParams } from "react-router-dom";
import { useSeo } from "../../lib/use-seo.js";
import {
  hireHref,
  hireTypeInfo,
  parseHireType,
  type HireType,
} from "../../components/hire/hire-params.js";
import { AllResults } from "../../components/hire/AllResults.js";
import { CarResults } from "../../components/hire/CarResults.js";
import { TruckResults } from "../../components/hire/TruckResults.js";
import { MachineryResults } from "../../components/hire/MachineryResults.js";
import { HireAbout } from "../../components/hire/HireAbout.js";

/**
 * `/hire` - the one hire search page (PR H4, docs/plans/hire-search-first.md).
 * Results come first: the Type dropdown (All, Cars, Trucks, Machinery),
 * the type's own filters, the grid. The few lines for search engines sit
 * below the results (`HireAbout`).
 *
 * `?type=` picks the view; each view owns its filters and its catalog
 * query (`components/hire/*Results.tsx`). Changing type keeps county and
 * dates and drops the rest (`hire-params.ts#typeChangeHref`). The old
 * addresses (`/cars`, `/cars/search` and the trucks and machinery ones)
 * redirect here with their query (`HireRedirect`).
 *
 * The canonical URL is the typed view itself, so "Cars on hire" and
 * "Trucks on hire" are each their own page to a search engine; filters
 * beyond the type are left out of it.
 *
 * Not from a canvas; built from tokens.ts.
 */

const DESCRIPTION: Record<HireType, string> = {
  all: "Hire a car, a truck or machinery anywhere in Kenya, from owners CRAL has checked. See the price before you pay, by M-Pesa.",
  cars: "Hire a car anywhere in Kenya, self-drive or with a driver. Every car is reviewed by CRAL before it's listed.",
  trucks:
    "Tippers, flatbeds, box bodies and more from owners CRAL has checked. Filter by county and load, then ask the owner for a price.",
  machinery:
    "Excavators, loaders, graders and more for site work, from owners CRAL has checked. Filter by county, dates and machine, then send the owner a request for free.",
};

export function HireSearch(): JSX.Element {
  const [params] = useSearchParams();
  const type = parseHireType(params.get("type"));
  useSeo({ title: hireTypeInfo(type).title, description: DESCRIPTION[type], path: hireHref(type) });

  return (
    <div>
      {/* Keyed by type: a new type is a new list, with its own scroll and state. */}
      {type === "all" && <AllResults key="all" />}
      {type === "cars" && <CarResults key="cars" />}
      {type === "trucks" && <TruckResults key="trucks" />}
      {type === "machinery" && <MachineryResults key="machinery" />}
      <HireAbout type={type} />
    </div>
  );
}

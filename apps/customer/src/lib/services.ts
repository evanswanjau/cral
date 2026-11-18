import type { Icon } from "@phosphor-icons/react";
import { Car } from "@phosphor-icons/react/dist/ssr/Car";
import { Truck } from "@phosphor-icons/react/dist/ssr/Truck";
import { Tractor } from "@phosphor-icons/react/dist/ssr/Tractor";
import { SteeringWheel } from "@phosphor-icons/react/dist/ssr/SteeringWheel";
import { TruckTrailer } from "@phosphor-icons/react/dist/ssr/TruckTrailer";
import { Wrench } from "@phosphor-icons/react/dist/ssr/Wrench";
import { Engine } from "@phosphor-icons/react/dist/ssr/Engine";
import { Handshake } from "@phosphor-icons/react/dist/ssr/Handshake";

/**
 * The registry of CRAL's services (UI1a, docs/plans/ui-services-proposal.md
 * sections 3, 4.4 and 4.5). The masthead tabs, the footer's SERVICES
 * column, the front door's doors and "Coming to CRAL" all read from here,
 * so a service is added or moved in one place.
 *
 * `href` is where the service works TODAY. Each sub-site PR (UI1b-UI3)
 * moves its entry to the final path written beside it, once that page
 * exists. `match` lists the path prefixes that mark the service's tab
 * active; an entry with a query (`/browse?category=truck`) only matches
 * when that parameter is set, and beats a bare path match.
 *
 * No per-service colour (owner decision 4): services are told apart by
 * photo, icon and kicker only.
 */

export type ServiceKey = "cars" | "trucks" | "machinery" | "drivers" | "towing" | "garage" | "parts" | "selling";

export interface LiveService {
  status: "live";
  key: ServiceKey;
  /** Masthead tab label. */
  tab: string;
  /** Front-door "door" label and its one-line note. */
  label: string;
  note: string;
  /** Mono overline on the sub-site hero, sits after the skewed rule. */
  kicker: string;
  h1: string;
  lede: string;
  icon: Icon;
  /** Hero photo under `public/images/services/`; see its CREDITS.txt. */
  photo: string;
  href: string;
  match: string[];
}

export interface ComingService {
  status: "coming";
  key: ServiceKey;
  label: string;
  kicker: string;
  /** Neutral pill word, by roadmap order. */
  pill: "NEXT" | "PLANNED";
  /** Canvas `vertDefs` title and sub, verbatim. */
  title: string;
  sub: string;
  icon: Icon;
}

export type Service = LiveService | ComingService;

export const SERVICES: Service[] = [
  {
    status: "live",
    key: "cars",
    tab: "Cars",
    label: "Hire a car",
    note: "Self-drive or with a driver",
    kicker: "HIRE A CAR",
    h1: "Hire a car whose papers a person has read.",
    lede: "Self-drive or with a driver, from owners CRAL has checked. Sending a request is free, and you pay by M-Pesa only once the owner accepts your dates.",
    icon: Car,
    photo: "/images/services/cars.jpg",
    href: "/cars",
    // `/browse` and `/book` until UI1c moves them under `/cars`.
    match: ["/cars"],
  },
  {
    status: "live",
    key: "trucks",
    tab: "Trucks",
    label: "Hire a truck",
    note: "Say the route, get a price",
    kicker: "HIRE A TRUCK",
    h1: "Tell us the load. Owners send the price.",
    lede: "Tippers, flatbeds and box bodies from owners CRAL has checked. You pay only once you accept a price.",
    icon: Truck,
    photo: "/images/services/trucks.jpg",
    href: "/trucks",
    match: ["/trucks"],
  },
  {
    status: "live",
    key: "machinery",
    tab: "Machinery",
    label: "Hire machinery",
    note: "Plant for site work, by the day",
    kicker: "HIRE MACHINERY",
    h1: "Plant for the site, by the day.",
    lede: "Machinery for site work from owners CRAL has checked. Sending a request is free, and you pay by M-Pesa only once the owner accepts your dates.",
    icon: Tractor,
    photo: "/images/services/machinery.jpg",
    href: "/browse?category=machinery", // final: /machinery (UI2b)
    match: ["/browse?category=machinery", "/machinery"],
  },
  {
    status: "live",
    key: "drivers",
    tab: "Drivers",
    label: "Hire a driver",
    note: "A checked driver for your own car",
    kicker: "HIRE A DRIVER",
    h1: "A checked driver for your car.",
    lede: "Every driver's licence and ID is read by CRAL before they appear here. Book one for your own car, or add one to a self-drive hire.",
    icon: SteeringWheel,
    photo: "/images/services/drivers.jpg",
    href: "/drivers", // final: /drivers (UI3)
    match: ["/drivers"],
  },
  {
    status: "live",
    key: "towing",
    tab: "Towing",
    label: "Call a tow",
    note: "Broken down or in an accident",
    kicker: "CALL A TOW",
    h1: "Broken down? Tell us where you are.",
    lede: "Send your location and what happened. CRAL finds a tow, agrees the price with you on the call, and keeps the request on your account.",
    icon: TruckTrailer,
    photo: "/images/services/towing.jpg",
    href: "/services/towing", // final: /towing (UI3)
    match: ["/services/towing", "/towing"],
  },
  {
    status: "coming",
    key: "garage",
    label: "Garage service",
    kicker: "SERVICE AND REPAIR",
    pill: "NEXT",
    title: "A garage that agrees the price before it lifts a spanner.",
    sub: "Book a vetted garage for a service, a diagnostic or a repair. The quote is written into CRAL before work starts, and nothing is added to it without you saying yes.",
    icon: Wrench,
  },
  {
    status: "coming",
    key: "parts",
    label: "Parts",
    kicker: "PARTS",
    pill: "PLANNED",
    title: "Parts that match your car, not just your model year.",
    sub: "Genuine, OEM and honest used parts from dealers CRAL has read the papers on. They quote against your chassis number instead of guessing, and it arrives fitted or delivered.",
    icon: Engine,
  },
  {
    status: "coming",
    key: "selling",
    label: "Buy and sell",
    kicker: "BUY AND SELL",
    pill: "PLANNED",
    title: "Nobody should buy a logbook that does not match the car.",
    sub: "Free listings for individuals and dealers alike, and CRAL reads the logbook against the car before the advert goes live. No deposits held, no cut of your sale.",
    icon: Handshake,
  },
];

export const LIVE_SERVICES: LiveService[] = SERVICES.filter((s): s is LiveService => s.status === "live");
export const COMING_SERVICES: ComingService[] = SERVICES.filter((s): s is ComingService => s.status === "coming");

export function getService(key: ServiceKey): Service | undefined {
  return SERVICES.find((s) => s.key === key);
}

/** 2 for a match that needs a query parameter, 1 for a path prefix, 0 for none. */
function matchScore(pattern: string, pathname: string, params: URLSearchParams): number {
  const [path = "", query] = pattern.split("?");
  const pathOk = pathname === path || pathname.startsWith(`${path}/`);
  if (!pathOk) return 0;
  if (!query) return 1;
  const wanted = new URLSearchParams(query);
  for (const [k, v] of wanted) if (params.get(k) !== v) return 0;
  return 2;
}

/** The live service whose tab is active at this location, if any. */
export function activeServiceKey(pathname: string, search: string): ServiceKey | null {
  const params = new URLSearchParams(search);
  let best: { key: ServiceKey; score: number } | null = null;
  for (const s of LIVE_SERVICES) {
    for (const m of s.match) {
      const score = matchScore(m, pathname, params);
      if (score > (best?.score ?? 0)) best = { key: s.key, score };
    }
  }
  return best?.key ?? null;
}

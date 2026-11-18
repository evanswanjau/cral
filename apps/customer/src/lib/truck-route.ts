import { COUNTIES } from "./kenya.js";
import { EMPTY_TRUCK_ROUTE, type TruckRouteDraft } from "../components/site/TruckRouteFields.js";

/**
 * How a truck job's route and load travel between `/trucks`,
 * `/trucks/search`, `/trucks/:id` and `/trucks/:id/request` (UI2a): as
 * query parameters, so a reload, a back button or a shared link keeps
 * them. `from` / `to` stay the hire DATES, as on every other booking
 * URL, so the places use their own names:
 *
 *   from_place, from_county, to_place, to_county, cargo, tonnes
 *
 * A county that isn't one of the 47 is dropped rather than carried, so an
 * edited link can't put a value in the form the API would refuse.
 */
export const ROUTE_PARAM_KEYS = ["from_place", "from_county", "to_place", "to_county", "cargo", "tonnes"] as const;

const isCounty = (v: string): boolean => (COUNTIES as readonly string[]).includes(v);

export function routeFromParams(params: URLSearchParams): TruckRouteDraft {
  const fromCounty = params.get("from_county") ?? "";
  const toCounty = params.get("to_county") ?? "";
  return {
    ...EMPTY_TRUCK_ROUTE,
    fromAddress: (params.get("from_place") ?? "").slice(0, 200),
    fromCounty: isCounty(fromCounty) ? fromCounty : "",
    toAddress: (params.get("to_place") ?? "").slice(0, 200),
    toCounty: isCounty(toCounty) ? toCounty : "",
    cargo: (params.get("cargo") ?? "").slice(0, 300),
    tonnes: (params.get("tonnes") ?? "").slice(0, 10),
  };
}

/** The draft as query parameters; blank fields are left out. */
export function routeToParams(d: TruckRouteDraft, into = new URLSearchParams()): URLSearchParams {
  const pairs: Array<[string, string]> = [
    ["from_place", d.fromAddress.trim()],
    ["from_county", d.fromCounty],
    ["to_place", d.toAddress.trim()],
    ["to_county", d.toCounty],
    ["cargo", d.cargo.trim()],
    ["tonnes", d.tonnes.trim()],
  ];
  for (const [k, v] of pairs) {
    if (v) into.set(k, v);
    else into.delete(k);
  }
  return into;
}

/** Only the route and load parameters of a query, as a `?...` string (or ""). */
export function routeQuery(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const k of ROUTE_PARAM_KEYS) {
    const v = params.get(k);
    if (v) out.set(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

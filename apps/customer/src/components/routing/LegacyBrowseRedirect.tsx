import { Navigate, useLocation } from "react-router-dom";

/**
 * `/browse?...` -> `/cars/search?...`, query kept. Kept forever: shared
 * links, bookmarks and old emails still point here.
 *
 * `?category=truck` goes to `/trucks/search` (UI2a), with the old truck
 * filters mapped onto its own: `county` -> `from_county`,
 * `payload_min_kg` -> `tonnes`, `truck_type` and `sort` as they are.
 * Dates and car-only filters are dropped; the truck search has neither.
 *
 * `?category=machinery` goes to `/machinery/search` (UI2b), keeping the
 * county, dates and sort; its search has no other filter.
 */
export function LegacyBrowseRedirect(): JSX.Element {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const category = params.get("category");
  if (category === "truck") {
    const q = new URLSearchParams();
    const county = params.get("county");
    const kg = Number(params.get("payload_min_kg"));
    if (county) q.set("from_county", county);
    if (Number.isFinite(kg) && kg > 0) q.set("tonnes", String(kg / 1000));
    for (const k of ["truck_type", "sort"]) {
      const v = params.get(k);
      if (v) q.set(k, v);
    }
    return <Navigate to={`/trucks/search${q.toString() ? `?${q}` : ""}`} replace />;
  }
  if (category === "machinery") {
    const q = new URLSearchParams();
    for (const k of ["county", "from", "to", "sort"]) {
      const v = params.get(k);
      if (v) q.set(k, v);
    }
    return <Navigate to={`/machinery/search${q.toString() ? `?${q}` : ""}`} replace />;
  }
  return <Navigate to={`/cars/search${search}`} replace />;
}

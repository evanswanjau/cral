import { Navigate, useLocation } from "react-router-dom";

/**
 * `/browse?...` -> `/hire?type=cars&...`, query kept. Kept forever: shared
 * links, bookmarks and old emails still point here. (It went to
 * `/cars/search` until PR H4 folded the three searches into `/hire`.)
 *
 * `?category=truck` goes to `/hire?type=trucks`, with the old truck
 * filters mapped onto its own: `county` as it is, `payload_min_kg` ->
 * `tonnes`, `truck_type` and `sort` as they are. Dates and car-only
 * filters are dropped; the truck search has neither.
 *
 * `?category=machinery` goes to `/hire?type=machinery`, keeping the
 * county, dates and sort.
 */
export function LegacyBrowseRedirect(): JSX.Element {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const category = params.get("category");
  if (category === "truck") {
    const q = new URLSearchParams({ type: "trucks" });
    const county = params.get("county");
    const kg = Number(params.get("payload_min_kg"));
    if (county) q.set("county", county);
    if (Number.isFinite(kg) && kg > 0) q.set("tonnes", String(kg / 1000));
    for (const k of ["truck_type", "sort"]) {
      const v = params.get(k);
      if (v) q.set(k, v);
    }
    return <Navigate to={`/hire?${q}`} replace />;
  }
  if (category === "machinery") {
    const q = new URLSearchParams({ type: "machinery" });
    for (const k of ["county", "from", "to", "sort"]) {
      const v = params.get(k);
      if (v) q.set(k, v);
    }
    return <Navigate to={`/hire?${q}`} replace />;
  }
  const q = new URLSearchParams(search);
  q.set("type", "cars");
  return <Navigate to={`/hire?${q}`} replace />;
}

import { Navigate, useLocation } from "react-router-dom";
import { Browse } from "../../pages/Browse.js";

/**
 * `/browse?...` -> `/cars/search?...`, query kept. Kept forever: shared
 * links, bookmarks and old emails still point here.
 *
 * `?category=truck` goes to `/trucks/search` (UI2a), with the old truck
 * filters mapped onto its own: `county` -> `from_county`,
 * `payload_min_kg` -> `tonnes`, `truck_type` and `sort` as they are.
 * Dates and car-only filters are dropped; the truck search has neither.
 *
 * Machinery has no search of its own yet, so `?category=machinery` keeps
 * rendering Browse in place.
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
  // TODO(UI2b): `category=machinery` redirects to /machinery likewise.
  if (category === "machinery") return <Browse />;
  return <Navigate to={`/cars/search${search}`} replace />;
}

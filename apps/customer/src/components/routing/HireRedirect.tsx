import { Navigate, useLocation } from "react-router-dom";
import type { HireGroup } from "../../lib/vehicle-categories.js";

/**
 * `/cars`, `/cars/search`, `/trucks`, `/trucks/search`, `/machinery` and
 * `/machinery/search` -> `/hire?type=...` (PR H4), the query kept. Kept
 * forever: shared links, bookmarks and old emails point at them. Detail
 * and booking paths (`/cars/:id`, `/trucks/:id/request`, ...) never come
 * here.
 *
 * The one rename: H3's truck search called its county `from_county`;
 * `/hire` calls every type's county `county`, so it survives a change of
 * type.
 */
export function HireRedirect({ type }: { type: HireGroup }): JSX.Element {
  const { search } = useLocation();
  const q = new URLSearchParams(search);
  q.delete("type");
  const fromCounty = q.get("from_county");
  if (type === "trucks" && fromCounty) {
    q.delete("from_county");
    if (!q.get("county")) q.set("county", fromCounty);
  }
  const rest = q.toString();
  return <Navigate to={`/hire?type=${type}${rest ? `&${rest}` : ""}`} replace />;
}

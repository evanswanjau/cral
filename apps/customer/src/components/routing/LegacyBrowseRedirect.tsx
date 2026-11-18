import { Navigate, useLocation } from "react-router-dom";
import { Browse } from "../../pages/Browse.js";

/**
 * `/browse?...` -> `/cars/search?...`, query kept. Kept forever: shared
 * links, bookmarks and old emails still point here.
 *
 * Trucks and machinery have no search of their own yet, so
 * `?category=truck` and `?category=machinery` keep rendering Browse in
 * place.
 */
export function LegacyBrowseRedirect(): JSX.Element {
  const { search } = useLocation();
  const category = new URLSearchParams(search).get("category");
  // TODO(UI2a): `category=truck` redirects to /trucks once that sub-site exists.
  if (category === "truck") return <Browse />;
  // TODO(UI2b): `category=machinery` redirects to /machinery likewise.
  if (category === "machinery") return <Browse />;
  return <Navigate to={`/cars/search${search}`} replace />;
}

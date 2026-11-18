import { Navigate, useLocation, useParams } from "react-router-dom";

/**
 * `/book/:id?...` -> `/cars/:id/book?...`, every param kept (`from`, `to`,
 * `driver`, ...). Kept forever: sign-in `?next=` links already in flight
 * carry the old path.
 */
export function LegacyBookRedirect(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { search } = useLocation();
  return <Navigate to={`/cars/${id ?? ""}/book${search}`} replace />;
}

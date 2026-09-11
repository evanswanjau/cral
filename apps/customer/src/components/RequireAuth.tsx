import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useIsAuthenticated } from "../lib/auth.js";

export function RequireAuth(): JSX.Element {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();
  if (!isAuthenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  return <Outlet />;
}

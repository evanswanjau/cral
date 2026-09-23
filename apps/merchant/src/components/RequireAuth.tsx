import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useIsAuthenticated } from "../lib/auth.js";
import { Landing } from "../pages/Landing.js";

/**
 * A signed-out visitor to the bare root gets the marketing/sign-up landing
 * page rather than bounced to `/sign-in` - `/` is CRAL's front door for
 * prospective merchants, not just the signed-in dashboard's address. Every
 * other protected path keeps redirecting to sign-in; only the exact `/`
 * path is special-cased, so a deep link to e.g. `/vehicles` behaves exactly
 * as before.
 */
export function RequireAuth(): JSX.Element {
  const isAuthenticated = useIsAuthenticated();
  const { pathname } = useLocation();
  if (!isAuthenticated) {
    if (pathname === "/") return <Landing />;
    return <Navigate to="/sign-in" replace />;
  }
  return <Outlet />;
}

import { Navigate, Outlet } from "react-router-dom";
import { useIsAuthenticated } from "../lib/auth.js";

export function RequireAuth(): JSX.Element {
  const isAuthenticated = useIsAuthenticated();
  if (!isAuthenticated) return <Navigate to="/sign-in" replace />;
  return <Outlet />;
}

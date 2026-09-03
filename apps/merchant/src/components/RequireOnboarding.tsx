import { Navigate, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { isOnboardingComplete, loadDraftFromServer } from "../lib/onboarding-draft.js";

/**
 * Keeps the dashboard behind onboarding. Progress is server-side now (see
 * lib/onboarding-draft.ts), so this has to be an async check - a merchant
 * on a brand-new device or browser has no localStorage to fall back on,
 * and the server is the only place that can say whether they're done.
 */
export function RequireOnboarding(): JSX.Element | null {
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding"],
    queryFn: loadDraftFromServer,
  });

  if (isLoading) return null;
  if (!data || !isOnboardingComplete(data)) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

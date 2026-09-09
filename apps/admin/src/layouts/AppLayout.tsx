import type { ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getAdminMe } from "../lib/auth-api.js";
import { setSession } from "../lib/auth.js";
import { ApiClientError } from "../lib/api.js";
import { Masthead } from "../components/console/Masthead.js";
import { SideNav } from "../components/console/SideNav.js";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { C } from "../components/console/styles.js";

export function AppLayout(): ReactNode {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const { data: me, isLoading, error } = useQuery({
    queryKey: ["admin", "me"],
    queryFn: getAdminMe,
    retry: false,
  });

  // A hard 401 here means the refresh in lib/api.ts already gave up and
  // cleared the session — send the reviewer to sign in rather than showing
  // a broken frame.
  if (error instanceof ApiClientError && error.status === 401) {
    setSession(null);
    navigate("/sign-in", { replace: true });
    return null;
  }

  if (isLoading || !me) {
    return (
      <div style={{ ...C.page, alignItems: "center", justifyContent: "center" }}>
        <span style={{ font: "500 12px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#838C9B" }}>
          LOADING THE CONSOLE…
        </span>
      </div>
    );
  }

  return (
    <div style={C.page}>
      <Masthead name={me.full_name} email={me.email} role={me.role} />
      <div style={C.body}>
        <div style={C.bodyInner}>
          <SideNav role={me.role} />
          <div style={C.main}>
            {/* Scoped to the page: a screen that throws leaves the nav
                standing. Keyed on the path so navigating away clears it. */}
            <ErrorBoundary resetKey={pathname} compact>
              <Outlet />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}

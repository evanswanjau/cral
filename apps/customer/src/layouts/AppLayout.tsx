import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useIsAuthenticated } from "../lib/auth.js";

// Customer portal nav per spec §1: Overview · My trips · Payments · My documents ·
// Notifications · Issues & help · My profile.
const NAV_ITEMS = [
  { to: "/", label: "Overview" },
  { to: "/trips", label: "My trips" },
  { to: "/payments", label: "Payments" },
  { to: "/documents", label: "My documents" },
  { to: "/notifications", label: "Notifications" },
  { to: "/help", label: "Issues & help" },
  { to: "/profile", label: "My profile" },
];

export function AppLayout(): ReactNode {
  const isAuthenticated = useIsAuthenticated();

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <span className="font-semibold">Cruz Ride Auto</span>
        <span className="text-sm text-slate-500">
          {isAuthenticated ? "Signed in" : "Not signed in"}
        </span>
      </header>
      <div className="flex">
        <nav className="w-48 shrink-0 border-r border-slate-200 p-4">
          <ul className="flex flex-col gap-1 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `block rounded px-2 py-1.5 ${isActive ? "bg-slate-100 font-medium" : "text-slate-600 hover:bg-slate-50"}`
                  }
                  end={item.to === "/"}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

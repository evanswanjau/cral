import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useIsAuthenticated } from "../lib/auth.js";

// Admin (Ops) console nav per spec §1/§23: Queues · Vehicles · Merchants ·
// Disputes · Invoices · Payments · Bulk comms · Settings · Audit log.
const NAV_ITEMS = [
  { to: "/", label: "Queues" },
  { to: "/vehicles", label: "Vehicles" },
  { to: "/merchants", label: "Merchants" },
  { to: "/disputes", label: "Disputes" },
  { to: "/invoices", label: "Invoices" },
  { to: "/payments", label: "Payments" },
  { to: "/comms", label: "Bulk comms" },
  { to: "/settings", label: "Settings" },
  { to: "/audit-log", label: "Audit log" },
];

// Dark surface, built for long compliance shifts (spec §1) — the console is
// deliberately styled apart from the two light customer-facing portals.
export function AppLayout(): ReactNode {
  const isAuthenticated = useIsAuthenticated();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <span className="font-semibold">Cruz Ride Auto — Ops</span>
        <span className="text-sm text-slate-400">
          {isAuthenticated ? "Signed in" : "Not signed in"}
        </span>
      </header>
      <div className="flex">
        <nav className="w-48 shrink-0 border-r border-slate-800 p-4">
          <ul className="flex flex-col gap-1 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `block rounded px-2 py-1.5 ${isActive ? "bg-slate-800 font-medium text-white" : "text-slate-400 hover:bg-slate-900"}`
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

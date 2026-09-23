import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { AdminRole } from "../../lib/auth-api.js";
import { C } from "./styles.js";

/**
 * The console's left nav, from "Cruz Admin Vehicles.dc.html"'s own nav
 * list. Only *built* destinations are shown — the rest of the design's
 * list (Dashboard, Payouts, Invoicing, Disputes) lands as later Phase-3
 * slices flip `built` on.
 * Within the built set, items are filtered to what the signed-in role can
 * reach; `admin_super` sees everything.
 *
 * "Communications" is a collapsible group with three children (Bulk
 * Email/SMS, Templates, Logs), read straight off "Cruz Admin Nav.dc.html"'s
 * own `kids` list (2026-09-16) - it auto-opens when a child route is
 * active, same interaction as the design's Finance group (not built yet).
 */
interface Leaf {
  kind: "leaf";
  to: string;
  label: string;
  roles: AdminRole[];
  built: boolean;
}
interface Group {
  kind: "group";
  id: string;
  label: string;
  roles: AdminRole[];
  built: boolean;
  kids: Array<{ to: string; label: string; end?: boolean }>;
}
type Item = Leaf | Group;

const ITEMS: Item[] = [
  { kind: "leaf", to: "/", label: "Dashboard", roles: ["admin_reviewer", "admin_finance", "admin_support"], built: false },
  { kind: "leaf", to: "/vehicles", label: "Vehicles", roles: ["admin_reviewer"], built: true },
  { kind: "leaf", to: "/merchants", label: "Merchants", roles: ["admin_reviewer", "admin_support"], built: true },
  { kind: "leaf", to: "/renters", label: "Renters", roles: ["admin_reviewer"], built: true },
  { kind: "leaf", to: "/bookings", label: "Bookings", roles: ["admin_support"], built: true },
  { kind: "leaf", to: "/services", label: "Services", roles: ["admin_support", "admin_reviewer"], built: true },
  { kind: "leaf", to: "/payouts", label: "Payouts", roles: ["admin_finance"], built: false },
  { kind: "leaf", to: "/invoicing", label: "Invoicing", roles: ["admin_finance"], built: false },
  { kind: "leaf", to: "/disputes", label: "Disputes", roles: ["admin_support"], built: false },
  // `admin_super`-only, same reach as Team/Settings — real money, every
  // merchant contactable at once.
  {
    kind: "group",
    id: "comm",
    label: "Communications",
    roles: [],
    built: true,
    kids: [
      { to: "/communications", label: "Bulk Email/SMS", end: true },
      { to: "/communications/templates", label: "Templates" },
      { to: "/communications/logs", label: "Logs" },
    ],
  },
  // `roles: []` reads as "no role" for anyone but `admin_super`, who
  // bypasses the role check below — so this is admin_super-only, same as
  // the design's Settings screen (Team + the audit reader live inside it).
  { kind: "leaf", to: "/settings", label: "Settings", roles: [], built: true },
];

export function SideNav({ role }: { role: AdminRole }): JSX.Element {
  const location = useLocation();
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});

  const visible = ITEMS.filter((it) => it.built && (role === "admin_super" || it.roles.includes(role)));

  return (
    <nav style={C.nav}>
      {visible.map((it) => {
        if (it.kind === "leaf") {
          return (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === "/"}
              style={({ isActive }) => ({
                ...C.navItem,
                background: isActive ? "#F1F3F6" : "transparent",
                color: isActive ? "#0F23A8" : "#333B4A",
              })}
            >
              {({ isActive }) => (
                <>
                  <span style={{ ...C.navDot, background: isActive ? "#0F23A8" : "#E4E7EC" }} />
                  <span style={C.navLabel}>{it.label}</span>
                </>
              )}
            </NavLink>
          );
        }

        const childActive = it.kids.some((k) => (k.end ? location.pathname === k.to : location.pathname.startsWith(k.to)));
        const isOpen = openOverride[it.id] ?? childActive;

        return (
          <div key={it.id} style={{ display: "grid", gap: 2 }}>
            <button
              type="button"
              onClick={() => setOpenOverride((cur) => ({ ...cur, [it.id]: !isOpen }))}
              style={{
                ...C.navItem,
                background: childActive && !isOpen ? "#F1F3F6" : "transparent",
                color: childActive ? "#0B0F1A" : "#1A1F2B",
              }}
            >
              <span style={{ ...C.navDot, background: childActive ? "#0F23A8" : "#CDD2DA" }} />
              <span style={C.navLabel}>{it.label}</span>
              <span style={{ ...C.navCaret, transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>
                <svg width="9" height="6" viewBox="0 0 10 6" aria-hidden="true">
                  <path d="M1 1.2 5 4.8 9 1.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
            {isOpen && (
              <div style={C.navKids}>
                {it.kids.map((k) => (
                  <NavLink
                    key={k.to}
                    to={k.to}
                    end={k.end ?? false}
                    style={({ isActive }) => ({
                      ...C.navKidItem,
                      background: isActive ? "#F1F3F6" : "transparent",
                      color: isActive ? "#0B0F1A" : "#5A6373",
                      fontWeight: isActive ? 600 : 500,
                    })}
                  >
                    {k.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

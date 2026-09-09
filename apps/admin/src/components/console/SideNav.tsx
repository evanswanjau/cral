import { NavLink } from "react-router-dom";
import type { AdminRole } from "../../lib/auth-api.js";
import { C } from "./styles.js";

/**
 * The console's left nav, from "Cruz Admin Vehicles.dc.html"'s own nav
 * list. Only *built* destinations are shown — the full list from the
 * design (Dashboard, Bookings, Payouts, Invoicing, Disputes,
 * Communications, Settings) lands as later Phase-3 slices flip `built` on.
 * Within the built set, items are filtered to what the signed-in role can
 * reach; `admin_super` sees everything.
 */
interface Item {
  to: string;
  label: string;
  roles: AdminRole[];
  built: boolean;
}

const ITEMS: Item[] = [
  { to: "/", label: "Dashboard", roles: ["admin_reviewer", "admin_finance", "admin_support"], built: false },
  { to: "/vehicles", label: "Vehicles", roles: ["admin_reviewer"], built: true },
  { to: "/merchants", label: "Merchants", roles: ["admin_reviewer", "admin_support"], built: true },
  { to: "/bookings", label: "Bookings", roles: ["admin_support"], built: false },
  { to: "/payouts", label: "Payouts", roles: ["admin_finance"], built: false },
  { to: "/invoicing", label: "Invoicing", roles: ["admin_finance"], built: false },
  { to: "/disputes", label: "Disputes", roles: ["admin_support"], built: false },
  { to: "/communications", label: "Communications", roles: [], built: false },
  { to: "/settings", label: "Settings", roles: [], built: false },
];

export function SideNav({ role }: { role: AdminRole }): JSX.Element {
  const visible = ITEMS.filter(
    (it) => it.built && (role === "admin_super" || it.roles.includes(role)),
  );

  return (
    <nav style={C.nav}>
      {visible.map((it) => (
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
      ))}
    </nav>
  );
}

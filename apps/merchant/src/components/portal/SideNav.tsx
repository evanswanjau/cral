import { NavLink } from "react-router-dom";
import { P } from "./styles.js";

/**
 * "Vehicles" and "Bookings" are shown — the design's canvas also has
 * Dashboard, Payouts, Notifications and Settings, but those screens
 * haven't been asked for yet (see CLAUDE.md's "Phase 1 — Identity,
 * merchant portal only" scoping). Bookings was added explicitly by the
 * owner ahead of the delivery plan's own phase ordering.
 */
export function SideNav({ vehicleCount, bookingCount }: { vehicleCount: number; bookingCount: number }): JSX.Element {
  return (
    <nav style={P.nav}>
      <NavLink to="/vehicles" style={({ isActive }) => ({ ...P.navItem, ...(isActive ? P.navItemActive : { color: "#333B4A" }), textDecoration: "none" })}>
        {({ isActive }) => (
          <>
            <span style={{ ...P.navDot, background: isActive ? "#0F23A8" : "transparent" }} />
            <span style={P.navLabel}>Vehicles</span>
            <span style={{ ...P.navTag, color: isActive ? "#5B6FE0" : "#A7AEBB" }}>{vehicleCount}</span>
          </>
        )}
      </NavLink>
      <NavLink to="/bookings" style={({ isActive }) => ({ ...P.navItem, ...(isActive ? P.navItemActive : { color: "#333B4A" }), textDecoration: "none" })}>
        {({ isActive }) => (
          <>
            <span style={{ ...P.navDot, background: isActive ? "#0F23A8" : "transparent" }} />
            <span style={P.navLabel}>Bookings</span>
            <span style={{ ...P.navTag, color: isActive ? "#5B6FE0" : "#A7AEBB" }}>{bookingCount}</span>
          </>
        )}
      </NavLink>
    </nav>
  );
}

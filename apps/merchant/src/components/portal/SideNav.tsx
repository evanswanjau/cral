import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { P } from "./styles.js";

/**
 * Every screen in the design's canvas is now built, and all six are listed.
 * Bookings, Payouts, Notifications, Settings and the Dashboard were each
 * added explicitly by the owner ahead of the delivery plan's phase order.
 *
 * Dashboard is first and is the portal's index route - "/" renders it rather
 * than redirecting to Vehicles, as it did before the screen existed. It
 * carries no count: it is a place, not a queue.
 *
 * Payouts carries no count badge: a run count is not something a merchant
 * needs to act on, unlike an unanswered booking request, and a number there
 * would read as "N things need you". Notifications is the opposite - its
 * badge is the *unread* count, which is genuinely actionable, so it shows
 * whenever it's non-zero.
 *
 * Settings (`/settings`) is a tabbed page - Business, Payouts,
 * Notifications, Security. It carries no badge: nothing under it is a
 * count a merchant needs to act on. The old `/settings/security` and
 * `/settings/notifications` URLs redirect into it.
 */
export function SideNav({
  vehicleCount,
  bookingCount,
  notificationUnread,
  footer,
}: {
  vehicleCount: number;
  bookingCount: number;
  notificationUnread: number;
  /** Hangs below the links. Only the dashboard passes one (its status card). */
  footer?: ReactNode;
}): JSX.Element {
  return (
    <nav style={P.nav}>
      <NavLink to="/" end style={({ isActive }) => ({ ...P.navItem, ...(isActive ? P.navItemActive : { color: "#333B4A" }), textDecoration: "none" })}>
        {({ isActive }) => (
          <>
            <span style={{ ...P.navDot, background: isActive ? "#0F23A8" : "transparent" }} />
            <span style={P.navLabel}>Dashboard</span>
          </>
        )}
      </NavLink>
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
      <NavLink to="/payouts" style={({ isActive }) => ({ ...P.navItem, ...(isActive ? P.navItemActive : { color: "#333B4A" }), textDecoration: "none" })}>
        {({ isActive }) => (
          <>
            <span style={{ ...P.navDot, background: isActive ? "#0F23A8" : "transparent" }} />
            <span style={P.navLabel}>Payouts</span>
          </>
        )}
      </NavLink>
      <NavLink to="/notifications" style={({ isActive }) => ({ ...P.navItem, ...(isActive ? P.navItemActive : { color: "#333B4A" }), textDecoration: "none" })}>
        {({ isActive }) => (
          <>
            <span style={{ ...P.navDot, background: isActive ? "#0F23A8" : "transparent" }} />
            <span style={P.navLabel}>Notifications</span>
            {notificationUnread > 0 && (
              <span style={{ ...P.navTag, color: isActive ? "#5B6FE0" : "#A7AEBB" }}>{notificationUnread}</span>
            )}
          </>
        )}
      </NavLink>
      <NavLink to="/settings" style={({ isActive }) => ({ ...P.navItem, ...(isActive ? P.navItemActive : { color: "#333B4A" }), textDecoration: "none" })}>
        {({ isActive }) => (
          <>
            <span style={{ ...P.navDot, background: isActive ? "#0F23A8" : "transparent" }} />
            <span style={P.navLabel}>Settings</span>
          </>
        )}
      </NavLink>
      {footer}
    </nav>
  );
}

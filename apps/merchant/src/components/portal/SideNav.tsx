import { useEffect, useRef, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { P } from "./styles.js";
import type { NavItem } from "./nav-sections.js";

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
 *
 * Which items show, and what Vehicles is called, comes from
 * `nav-sections.ts` (by what the merchant offers). The same list is the
 * desktop side nav and the mobile strip.
 */
export function SideNav({
  items,
  footer,
}: {
  items: NavItem[];
  /** Hangs below the links. Only the dashboard passes one (its status card). */
  footer?: ReactNode;
}): JSX.Element {
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // On a phone the nav is a sideways-scrolling strip; keep the current tab in view.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>("a.active");
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    const offset = active.getBoundingClientRect().left - nav.getBoundingClientRect().left;
    nav.scrollTo({ left: nav.scrollLeft + offset - (nav.clientWidth - active.offsetWidth) / 2 });
  }, [pathname]);

  return (
    <nav ref={navRef} className="m-nav" style={P.nav}>
      {items.map((item) => (
        <NavLink
          key={item.key}
          to={item.to}
          end={item.to === "/"}
          style={({ isActive }) => ({ ...P.navItem, ...(isActive ? P.navItemActive : { color: "#333B4A" }), textDecoration: "none" })}
        >
          {({ isActive }) => (
            <>
              <span style={{ ...P.navDot, background: isActive ? "#0F23A8" : "transparent" }} />
              <span style={P.navLabel}>{item.label}</span>
              {item.count !== undefined && (
                <span style={{ ...P.navTag, color: isActive ? "#5B6FE0" : "#A7AEBB" }}>{item.count}</span>
              )}
            </>
          )}
        </NavLink>
      ))}
      {footer && <div className="m-nav-footer">{footer}</div>}
    </nav>
  );
}

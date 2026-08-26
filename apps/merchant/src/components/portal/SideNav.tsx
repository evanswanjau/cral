import { P } from "./styles.js";

/**
 * Only "Vehicles" is shown — the design's canvas has Dashboard, Vehicles,
 * Bookings, Payouts, Notifications and Settings, but the owner's explicit
 * call for this slice was a single-item nav (Phase 1 is Vehicles only;
 * see CLAUDE.md's "Phase 1 — Identity, merchant portal only" scoping).
 */
export function SideNav({ count }: { count: number }): JSX.Element {
  return (
    <nav style={P.nav}>
      <button type="button" style={{ ...P.navItem, ...P.navItemActive }}>
        <span style={{ ...P.navDot, background: "#0F23A8" }} />
        <span style={P.navLabel}>Vehicles</span>
        <span style={{ ...P.navTag, color: "#5B6FE0" }}>{count}</span>
      </button>
    </nav>
  );
}

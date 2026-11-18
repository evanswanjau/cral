import { Link, useLocation } from "react-router-dom";
import { LIVE_SERVICES, activeServiceKey } from "../../lib/services.js";

/**
 * The masthead's second row: one tab per live service, from the registry
 * (lib/services.ts). Coming services are never tabs (proposal 4.5).
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.4.
 *
 * At 375px the row scrolls sideways inside itself (`cral-rail` hides the
 * scrollbar); the page never does. The active tab is marked three ways,
 * not by colour alone: heavier weight, a 2px underline bar, and
 * `aria-current="page"`.
 */
export function ServiceTabs({ transparent = false }: { transparent?: boolean }): JSX.Element {
  const { pathname, search } = useLocation();
  const active = activeServiceKey(pathname, search);

  return (
    <nav aria-label="Services" className="cral-rail" style={{ display: "flex", gap: 2, overflowX: "auto", minWidth: 0 }}>
      {LIVE_SERVICES.map((s) => {
        const on = s.key === active;
        const Icon = s.icon;
        const fg = transparent ? (on ? "#FFFFFF" : "rgba(255,255,255,.75)") : on ? "#0B0F1A" : "#5A6373";
        return (
          <Link
            key={s.key}
            to={s.href}
            aria-current={on ? "page" : undefined}
            style={{
              position: "relative",
              flex: "none",
              height: 44,
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "0 12px",
              color: fg,
              font: `${on ? 600 : 500} 14px/1 'Instrument Sans',sans-serif`,
              whiteSpace: "nowrap",
              textDecoration: "none",
            }}
          >
            <Icon size={18} weight={on ? "bold" : "regular"} aria-hidden="true" />
            {s.tab}
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                bottom: 0,
                height: 2,
                borderRadius: 2,
                background: on ? (transparent ? "#FFFFFF" : "#0F23A8") : "transparent",
              }}
            />
          </Link>
        );
      })}
    </nav>
  );
}

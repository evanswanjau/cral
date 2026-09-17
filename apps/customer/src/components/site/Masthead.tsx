import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "../../assets/cral-logo.png";
import { useIsAuthenticated } from "../../lib/auth.js";
import { AccountMenu } from "./AccountMenu.js";

/**
 * The public masthead, reproduced from
 * `docs/brand/canvas/Cruz Ride Auto - Website.dc.html` (`navItems`/
 * `goHome`/`goList` in its `<script data-dc-script>` block) with its own
 * inline styles verbatim - the design is 100% inline-styled, so this
 * matches exactly rather than approximately.
 *
 * The design's masthead has no standalone CTA besides "List your car" -
 * account, sign-in, notifications and everything else live in the avatar
 * dropdown (see AccountMenu.tsx, including what it adds beyond the
 * canvas and why).
 */

const NAV: Array<{ label: string; to: string; activeOn: (pathname: string) => boolean }> = [
  {
    label: "Find a car",
    to: "/browse",
    activeOn: (p) => p === "/browse" || p.startsWith("/cars/") || p.startsWith("/book/"),
  },
  { label: "Find parts", to: "/parts", activeOn: (p) => p === "/parts" },
  { label: "Find services", to: "/services", activeOn: (p) => p === "/services" },
];

export function Masthead(): JSX.Element {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAuthenticated = useIsAuthenticated();

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "rgba(255,255,255,.94)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid #E4E7EC",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "0 clamp(16px,4vw,40px)",
          height: 66,
          display: "flex",
          alignItems: "center",
          gap: "clamp(12px,3vw,34px)",
        }}
      >
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 11, flex: "none" }}>
          <img src={logo} alt="Cruz Ride Auto Limited" style={{ display: "block", height: 46, width: "auto" }} />
        </Link>

        <div className="cral-rail" style={{ flex: 1, display: "flex", alignItems: "center", gap: 2, overflowX: "auto" }}>
          {NAV.map((n) => {
            const on = n.activeOn(pathname);
            return (
              <Link
                key={n.to}
                to={n.to}
                style={{
                  flex: "none",
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  background: on ? "#F1F3F6" : "transparent",
                  color: on ? "#0B0F1A" : "#5A6373",
                  borderRadius: 7,
                  font: `${on ? 600 : 500} 14px/1 'Instrument Sans',sans-serif`,
                  whiteSpace: "nowrap",
                  textDecoration: "none",
                }}
              >
                {n.label}
              </Link>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, flex: "none" }}>
          {isAuthenticated ? (
            <AccountMenu />
          ) : (
            <button
              type="button"
              onClick={() => navigate("/sign-in")}
              style={{
                height: 38,
                padding: "0 13px",
                background: "none",
                color: "#333B4A",
                border: "none",
                borderRadius: 8,
                font: "600 14px/1 'Instrument Sans',sans-serif",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Sign in
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/list-your-car")}
            style={{
              height: 38,
              padding: "0 15px",
              background: "#0F23A8",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              font: "600 14px/1 'Instrument Sans',sans-serif",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            List your car
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "../../assets/cral-logo.png";
import logoWhite from "../../assets/cral-white-logo.png";
import { useIsAuthenticated } from "../../lib/auth.js";
import { merchantLandingUrl } from "../../lib/merchant-app.js";
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
 *
 * On the home page only, the masthead starts transparent (white wordmark,
 * white nav text) floating over the hero's dark background, and reveals
 * its solid white bar once the page scrolls past it - the hero is the only
 * public page dark enough at the top for a transparent nav to read. Every
 * other page keeps the always-solid bar, sitting in flow rather than
 * floating over content that was never designed to sit under it.
 */

const SCROLL_REVEAL_PX = 24;

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
  const location = useLocation();
  const { pathname } = location;
  const isAuthenticated = useIsAuthenticated();
  const isHome = pathname === "/";

  const [scrolled, setScrolled] = useState(!isHome);
  useEffect(() => {
    if (!isHome) {
      setScrolled(true);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > SCROLL_REVEAL_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  const transparent = isHome && !scrolled;

  return (
    <div
      style={{
        position: isHome ? "fixed" : "sticky",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: transparent ? "transparent" : "rgba(255,255,255,.94)",
        backdropFilter: transparent ? "none" : "blur(10px)",
        borderBottom: transparent ? "1px solid transparent" : "1px solid #E4E7EC",
        transition: "background .2s ease, border-color .2s ease",
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
          <img
            src={transparent ? logoWhite : logo}
            alt="Cruz Ride Auto Limited"
            style={{ display: "block", height: 46, width: "auto" }}
          />
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
                  background: on ? (transparent ? "rgba(255,255,255,.12)" : "#F1F3F6") : "transparent",
                  color: transparent ? (on ? "#FFFFFF" : "rgba(255,255,255,.75)") : on ? "#0B0F1A" : "#5A6373",
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
              onClick={() => {
                // Carry where they are, so signing in returns them here
                // rather than dumping them on the home page.
                const here = `${location.pathname}${location.search}`;
                navigate(here === "/" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(here)}`);
              }}
              style={{
                height: 38,
                padding: "0 13px",
                background: "none",
                color: transparent ? "#FFFFFF" : "#333B4A",
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
          <a
            href={merchantLandingUrl()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 38,
              padding: "0 15px",
              background: "#0F23A8",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              font: "600 14px/1 'Instrument Sans',sans-serif",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            List your car
          </a>
        </div>
      </div>
    </div>
  );
}

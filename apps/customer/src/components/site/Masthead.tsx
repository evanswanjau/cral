import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "../../assets/cral-logo.png";
import logoWhite from "../../assets/cral-white-logo.png";
import { useIsAuthenticated } from "../../lib/auth.js";
import { merchantLandingUrl } from "../../lib/merchant-app.js";
import { ServiceTabs } from "../subsite/ServiceTabs.js";
import { AccountMenu } from "./AccountMenu.js";

/**
 * The public masthead. Bar, logo, sign-in and CTA styles are reproduced
 * from `docs/brand/canvas/Cruz Ride Auto - Website.dc.html` (`navItems`/
 * `goHome`/`goList` in its `<script data-dc-script>` block), inline
 * styles verbatim.
 *
 * UI1a (docs/plans/ui-services-proposal.md 4.4, 5.1, 5.2) replaced the
 * canvas's car-only nav (Find a car / Find parts / Find services) with
 * `ServiceTabs`, one tab per live service from `lib/services.ts`. That
 * part is not from a canvas; built from tokens.ts. On a phone the tabs
 * are a second row that scrolls sideways inside itself; from 960px they
 * sit in the one row between logo and account (`.cral-mast` in
 * index.css). Parts and garage are not tabs: they are not live, and show
 * once, in "Coming to CRAL". The canvas's "List your car" became "Earn
 * with CRAL", since every supplier (trucks, machinery, drivers) earns
 * here, not only car owners.
 *
 * Account, sign-in, notifications and everything else live in the avatar
 * dropdown (see AccountMenu.tsx).
 *
 * On the home page only, the masthead starts transparent (white wordmark,
 * white nav text) floating over the hero's dark background, and reveals
 * its solid white bar once the page scrolls past it - the hero is the only
 * public page dark enough at the top for a transparent nav to read. Every
 * other page keeps the always-solid bar, sitting in flow rather than
 * floating over content that was never designed to sit under it.
 */

const SCROLL_REVEAL_PX = 24;

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
        className="cral-mast"
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "0 clamp(16px,4vw,40px)",
          minHeight: 66,
        }}
      >
        <Link to="/" className="cral-mast-logo" style={{ display: "flex", alignItems: "center", height: 66 }}>
          <img
            src={transparent ? logoWhite : logo}
            alt="Cruz Ride Auto Limited"
            style={{ display: "block", height: 46, width: "auto" }}
          />
        </Link>

        <div className="cral-mast-tabs">
          <ServiceTabs transparent={transparent} />
        </div>

        <div className="cral-mast-actions" style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
                height: 44,
                padding: "0 10px",
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
              height: 44,
              padding: "0 14px",
              background: "#0F23A8",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              font: "600 14px/1 'Instrument Sans',sans-serif",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Earn with CRAL
          </a>
        </div>
      </div>
    </div>
  );
}

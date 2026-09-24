import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr/WhatsappLogo";
import { BrandPanel, type BrandPanelVariant } from "./BrandPanel.js";
import { ErrorBanner } from "./primitives.js";
import { bookingFromNext } from "./next.js";
import { S } from "./styles.js";
import { whatsappLink } from "../../lib/support.js";
import { merchantLandingUrl } from "../../lib/merchant-app.js";

/**
 * The customer auth layout: dark brand panel on the left, the form on the
 * right - the merchant portal's `AuthShell` (owner's call, 2026-09-24),
 * with renter copy and the key-handover photo. Every customer auth screen
 * (sign-in, create account, forgot and reset password) is a set of
 * children inside it. These routes sit outside `SiteShell`, so the page is
 * the whole viewport, the same as the merchant portal.
 */
export function AuthShell({
  heading,
  subheading,
  children,
  error,
  footer,
  panel,
  next = "/",
}: {
  heading: string;
  subheading: ReactNode;
  children: ReactNode;
  error?: ReactNode;
  /** The bordered link row at the bottom ("New to CRAL? Create an account"). */
  footer?: { text: string; linkLabel: string; to: string };
  panel: BrandPanelVariant;
  /** Where the flow resumes afterwards - always an in-app path. */
  next?: string;
}): JSX.Element {
  const booking = bookingFromNext(next);
  return (
    <div style={S.page}>
      {/* Below the grid's stacking point the form comes first, so on a
          phone nobody scrolls past the pitch to reach the sign-in. Same
          rule as the merchant portal's AuthShell. */}
      <style>{`@media (max-width: 860px) { .cral-auth-form-panel { order: -1; } }`}</style>

      <BrandPanel variant={panel} next={next} />

      <div className="cral-auth-form-panel" style={S.formPanel}>
        <div style={S.formInner}>
          <Link to={booking ? next : "/"} style={S.back}>
            <ArrowLeft size={15} weight="bold" />
            {booking ? "Back to the car" : "Back to CRAL"}
          </Link>

          <div style={{ marginBottom: 22 }}>
            <h2 style={S.heading}>{heading}</h2>
            <p style={S.subheading}>{subheading}</p>
          </div>

          {children}

          {error && <ErrorBanner message={error} />}

          {footer && (
            <div style={S.bottom}>
              <div style={S.bottomRow}>
                <span style={S.bottomText}>{footer.text}</span>
                <Link to={footer.to} style={S.bottomLink}>
                  {footer.linkLabel}
                </Link>
              </div>
              <div style={S.bottomRow}>
                {/* The merchant portal is a separate app with its own
                    sign-in (lib/merchant-app.ts) - a car owner who lands
                    here is pointed at it rather than promised one login. */}
                <span style={{ ...S.bottomText, fontSize: 13 }}>Listing a car?</span>
                <a href={merchantLandingUrl()} style={{ ...S.bottomLink, fontSize: 13 }}>
                  Go to the merchant portal
                </a>
              </div>
            </div>
          )}

          <a
            href={whatsappLink("Hi CRAL - I need help signing in or signing up")}
            target="_blank"
            rel="noreferrer"
            style={HELP}
          >
            <WhatsappLogo size={18} weight="fill" color="#1DA851" />
            <span>
              Need a hand? <span style={{ color: "#0F23A8", fontWeight: 600 }}>Chat with us on WhatsApp</span>
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}

const HELP = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  marginTop: 22,
  font: "400 13.5px/1.4 'Instrument Sans',sans-serif",
  color: "#5A6373",
  textDecoration: "none",
} as const;

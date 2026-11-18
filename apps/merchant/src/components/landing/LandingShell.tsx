import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr/WhatsappLogo";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_E164, whatsappLink } from "../../lib/support.js";
import { SUPPLIERS, SUPPLIER_TYPES } from "../../lib/supplier-types.js";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { IMG, LANDING_CSS, SANS } from "./landing-style.js";

/**
 * Header, footer and floating WhatsApp button around the signed-out
 * merchant pages (`/` and `/join/:type`). WhatsApp appears three times
 * here (header, footer, floating button); a page adds at most one more.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.6 and 5.5.
 */

export function Kicker({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="ml-kicker">
      <span className="ml-kicker-dot" />
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="ml-eyebrow">
      <span className="ml-eyebrow-rule" />
      <span>{children}</span>
    </div>
  );
}

export function LandingShell({
  nav,
  signUpHref = "/create-account",
  waMessage,
  children,
}: {
  /** In-page anchors for the desktop header. */
  nav: Array<{ href: string; label: string }>;
  signUpHref?: string;
  waMessage: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="ml-root">
      <style>{LANDING_CSS}</style>
      <header className="ml-header">
        <div className="ml-wrap ml-header-inner">
          <Link to="/" aria-label="CRAL merchant home" style={{ flex: "none" }}>
            <img src="/logo-white.png" alt="Cruz Ride Auto Limited" style={{ display: "block", height: 40, width: "auto" }} />
          </Link>
          <nav className="ml-nav" aria-label="Page sections">
            {nav.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-header-right">
            <a className="ml-text-link ml-header-wa" href={whatsappLink(waMessage)} target="_blank" rel="noreferrer">
              <WhatsappLogo size={18} weight="fill" />
              Talk to us
            </a>
            <Link className="ml-text-link" to="/sign-in">
              Sign in
            </Link>
            <Link className="ml-btn ml-btn-primary ml-btn-sm" to={signUpHref}>
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="ml-footer">
        <div className="ml-wrap">
          <div className="ml-footer-grid">
            <div>
              <img
                src="/logo-white.png"
                alt="Cruz Ride Auto Limited"
                style={{ display: "block", height: 48, width: "auto", marginBottom: 16 }}
              />
              <p style={{ margin: 0, maxWidth: 320, font: `400 14px/1.6 ${SANS}` }}>
                The merchant side of CRAL, Kenya's marketplace for hiring cars, trucks, machinery and
                drivers.
              </p>
            </div>
            <div>
              <h4>WAYS TO EARN</h4>
              <ul>
                {SUPPLIER_TYPES.map((t) => (
                  <li key={t}>
                    <Link to={`/join/${t}`}>{SUPPLIERS[t].label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>MERCHANTS</h4>
              <ul>
                <li>
                  <Link to={signUpHref}>Create an account</Link>
                </li>
                <li>
                  <Link to="/sign-in">Sign in</Link>
                </li>
              </ul>
            </div>
            <div>
              <h4>HELP</h4>
              <ul>
                <li>
                  <a href={whatsappLink()} target="_blank" rel="noreferrer">
                    <WhatsappLogo size={16} weight="fill" /> WhatsApp {SUPPORT_PHONE_DISPLAY}
                  </a>
                </li>
                <li>
                  <a href={`tel:${SUPPORT_PHONE_E164}`}>Call {SUPPORT_PHONE_DISPLAY}</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="ml-footer-base">© 2026 CRAL · CRUZ RIDE AUTO LIMITED · NAIROBI, KENYA</div>
        </div>
      </footer>

      <a
        className="ml-fab"
        href={whatsappLink(waMessage)}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat with CRAL on WhatsApp"
      >
        <WhatsappLogo size={28} weight="fill" />
        <span className="ml-fab-label">Chat with us</span>
      </a>
    </div>
  );
}

/** Numbered steps: three on `/`, four on a supplier page. */
export function StepsSection({
  kicker,
  heading,
  steps,
}: {
  kicker: string;
  heading: string;
  steps: Array<{ title: string; body: string }>;
}): JSX.Element {
  return (
    <section id="how" className="ml-section" style={{ paddingTop: 0 }}>
      <div className="ml-wrap">
        <div className="ml-head">
          <Kicker>{kicker}</Kicker>
          <h2 className="ml-h2">{heading}</h2>
        </div>
        <div className={steps.length === 4 ? "ml-steps ml-steps-4" : "ml-steps"}>
          {steps.map((s, i) => (
            <article key={s.title} className="ml-step">
              <span className="ml-step-n">STEP {String(i + 1).padStart(2, "0")}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Closing blue band with the sign-up button. */
export function FinalCta({ heading, cta, href }: { heading: string; cta: string; href: string }): JSX.Element {
  return (
    <section className="ml-final">
      <img src={IMG("cta")} alt="" loading="lazy" />
      <div className="ml-final-shade" />
      <div className="ml-wrap ml-final-inner">
        <h2>{heading}</h2>
        <p>Create your merchant account in a couple of minutes. You can be live within days.</p>
        <div className="ml-cta-row">
          <Link className="ml-btn ml-btn-white" to={href}>
            {cta}
            <ArrowRight size={18} weight="bold" />
          </Link>
        </div>
      </div>
    </section>
  );
}

import { Link } from "react-router-dom";
import type { Icon } from "@phosphor-icons/react";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { DeviceMobile } from "@phosphor-icons/react/dist/ssr/DeviceMobile";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { Tag } from "@phosphor-icons/react/dist/ssr/Tag";
import { Prohibit } from "@phosphor-icons/react/dist/ssr/Prohibit";
import { HandPointing } from "@phosphor-icons/react/dist/ssr/HandPointing";
import { Wallet } from "@phosphor-icons/react/dist/ssr/Wallet";
import { Wrench } from "@phosphor-icons/react/dist/ssr/Wrench";
import { Gear } from "@phosphor-icons/react/dist/ssr/Gear";
import { Storefront } from "@phosphor-icons/react/dist/ssr/Storefront";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { usePageTitle } from "../lib/use-page-title.js";
import { whatsappLink } from "../lib/support.js";
import { COMING_SUPPLIERS, COST_FAQ, PAY_FAQ, REVIEW_FAQ, SUPPLIER_TYPES, type SupplierFaq } from "../lib/supplier-types.js";
import { Eyebrow, FinalCta, Kicker, LandingShell, StepsSection } from "../components/landing/LandingShell.js";
import { SupplierDoors } from "../components/landing/SupplierDoors.js";
import { EarningsSection } from "../components/landing/Estimator.js";
import { LandingFaq } from "../components/landing/LandingFaq.js";
import { IMG } from "../components/landing/landing-style.js";

/**
 * "Earn with CRAL": the merchant site's signed-out front door at `/`
 * (RequireAuth renders it in place of the sign-in redirect for that exact
 * path only). One door per supplier type, each to its `/join/<type>` page.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.6 and 5.5. Photos in
 * `public/images/landing/` are Unsplash placeholders (see CREDITS.txt
 * there); swap a file for real photography by keeping its name.
 *
 * WhatsApp CTAs: header, FAQ help, footer, floating button, plus the one
 * "tell us you're interested" link on the coming-suppliers strip. CRAL's
 * commission percentage is never shown here; the estimator shows
 * take-home after the fee.
 */

const STEPS = [
  {
    title: "Sign up and say what you offer",
    body: "Cars, trucks, machinery or driving, from your phone. About ten minutes, and your progress saves as you go.",
  },
  {
    title: "A person checks the papers",
    body: "A CRAL reviewer reads your documents, usually within two working days, and tells you exactly what's missing if anything is.",
  },
  {
    title: "Accept requests, get paid",
    body: "You choose the jobs you take. Hirers pay CRAL by M-Pesa, and your take-home lands on M-Pesa or in your bank.",
  },
];

const WHY: Array<{ icon: Icon; title: string; body: string }> = [
  { icon: Tag, title: "You set the price", body: "Per day, per trip, per hour, per km or per tonne, depending on what you offer. Change it whenever you like." },
  { icon: Prohibit, title: "No sign-up fee", body: "Nothing is charged while you're not working. CRAL only earns when you do." },
  { icon: HandPointing, title: "You pick the jobs", body: "Every request shows what you'll take home. Accept the ones that suit you and decline the rest." },
  { icon: Wallet, title: "Paid to M-Pesa or bank", body: "Weekly or monthly payouts, with a receipt and a statement for every run." },
];

const COMING_ICONS: Record<(typeof COMING_SUPPLIERS)[number], Icon> = {
  "Parts dealers": Gear,
  "Car sellers": Storefront,
};

const FAQ: SupplierFaq[] = [
  COST_FAQ,
  {
    q: "What can I offer on CRAL?",
    a: "Cars and vans, trucks and trailers, construction and farm machinery, driving (yourself or your own drivers), and garage services at your own premises. Pick one or more when you sign up, and add the rest later.",
  },
  {
    q: "Do I need a vehicle to join?",
    a: "No. If you only drive, sign up to drive. Hirers book you for their own car, or with a car another owner lists.",
  },
  {
    q: "Do I need to be a registered company?",
    a: "No. Individuals and companies can both join. A company also provides its certificate of incorporation, company KRA PIN and CR12.",
  },
  REVIEW_FAQ,
  PAY_FAQ,
];

function Hero(): JSX.Element {
  return (
    <section className="ml-hero">
      <img className="ml-hero-img" src={IMG("hero")} alt="" style={{ transform: "scaleX(-1)" }} />
      <div className="ml-hero-shade" />
      <div className="ml-wrap ml-hero-content ml-hero-split">
        <div>
          <Eyebrow>FOR OWNERS, FLEETS AND DRIVERS</Eyebrow>
          <h1>Put what you own, or how you drive, to work.</h1>
          <p className="ml-hero-lede">
            Hire out your cars, trucks or machinery, or drive for hirers, on CRAL. Set your own rate,
            accept the jobs that suit you, and get paid to M-Pesa or your bank.
          </p>
          <div className="ml-chips">
            <span className="ml-chip">
              <ShieldCheck size={16} weight="bold" color="#57D69E" />
              Every supplier checked by a person
            </span>
            <span className="ml-chip">
              <DeviceMobile size={16} weight="bold" />
              Payouts to M-Pesa or bank
            </span>
            <span className="ml-chip">
              <MapPin size={16} weight="bold" />
              Any county
            </span>
          </div>
        </div>
        <SupplierDoors />
      </div>
    </section>
  );
}

function Coming(): JSX.Element {
  return (
    <>
    {/* Garages opened in Phase 4 GS4: their own page, not a door (no vehicle, no estimator). */}
    <div className="ml-coming">
      <div className="ml-wrap ml-coming-inner">
        <span className="ml-kicker" style={{ margin: 0 }}>
          <span className="ml-kicker-dot" />
          NOW OPEN
        </span>
        <div className="ml-coming-list">
          <span className="ml-coming-chip" style={{ borderStyle: "solid" }}>
            <Wrench size={16} weight="regular" />
            Garages
          </span>
        </div>
        <Link className="ml-coming-link" to="/join/garages">
          Join as a garage
          <ArrowRight size={16} weight="bold" />
        </Link>
      </div>
    </div>
    <div className="ml-coming">
      <div className="ml-wrap ml-coming-inner">
        <span className="ml-kicker" style={{ margin: 0 }}>
          <span className="ml-kicker-dot" />
          COMING TO CRAL
        </span>
        <div className="ml-coming-list">
          {COMING_SUPPLIERS.map((label) => {
            const ComingIcon = COMING_ICONS[label];
            return (
              <span key={label} className="ml-coming-chip">
                <ComingIcon size={16} weight="regular" />
                {label}
              </span>
            );
          })}
        </div>
        <a
          className="ml-coming-link"
          href={whatsappLink("Hi CRAL - I sell parts or sell cars, and I'm interested in joining")}
          target="_blank"
          rel="noreferrer"
        >
          Tell us you're interested
          <ArrowRight size={16} weight="bold" />
        </a>
      </div>
    </div>
    </>
  );
}

function Why(): JSX.Element {
  return (
    <section id="payouts" className="ml-section ml-why">
      <div className="ml-wrap">
        <div className="ml-head">
          <Kicker>PRICES AND PAYOUTS</Kicker>
          <h2 className="ml-h2">Your work, your rules.</h2>
        </div>
        <div className="ml-why-grid">
          {WHY.map((w) => {
            const WhyIcon = w.icon;
            return (
              <div key={w.title}>
                <div className="ml-why-icon">
                  <WhyIcon size={24} weight="regular" />
                </div>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Landing(): JSX.Element {
  usePageTitle("Earn with CRAL");
  return (
    <LandingShell
      waMessage="Hi CRAL - I'd like to earn with CRAL"
      nav={[
        { href: "#suppliers", label: "Who it's for" },
        { href: "#earnings", label: "Earnings" },
        { href: "#how", label: "How it works" },
        { href: "#faq", label: "FAQ" },
      ]}
    >
      <Hero />
      <Coming />
      <EarningsSection type={SUPPLIER_TYPES[0]} switchable />
      <StepsSection kicker="HOW IT WORKS" heading="From sign-up to first payout in three steps." steps={STEPS} />
      <Why />
      <div style={{ height: "clamp(48px,7vw,96px)" }} />
      <LandingFaq heading="Things suppliers ask us." items={FAQ} waMessage="Hi CRAL - I have a question about joining" />
      <FinalCta heading="Ready to earn with CRAL?" cta="Create a merchant account" href="/create-account" />
    </LandingShell>
  );
}

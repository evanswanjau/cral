import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { ServiceDoors } from "../components/subsite/ServiceDoors.js";
import { TrustStrip } from "../components/subsite/TrustStrip.js";
import { HowItWorksSteps, type Step } from "../components/subsite/HowItWorksSteps.js";
import { ComingServices } from "../components/subsite/ComingServices.js";
import { EarnBand } from "../components/subsite/EarnBand.js";

/**
 * The front door (UI1b). Its only job is "which service do you need?":
 * an ink hero with the live services as doors, the trust strip,
 * "How CRAL works" (`#how`), "Coming to CRAL" (`#coming`) and the
 * "Earn with CRAL" band. No car search here (owner decision 1,
 * 2026-11-18): it moved to `/cars` with the collection rails and the
 * car-type tiles.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.2, 5.1 and 5.2. The
 * doors and the trust points follow the Website canvas's `doors` and
 * `trustCols` (see ServiceDoors.tsx and TrustStrip.tsx).
 *
 * `/parts` redirects to `/#coming` (`/services` goes to `/garage`); the effect below
 * scrolls to whichever anchor the URL names, since the router does not.
 */

const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Cruz Ride Auto Limited",
  alternateName: "CRAL",
  url: "https://cral.co.ke",
  email: "hello@cral.co.ke",
  telephone: "+254735656066",
  address: { "@type": "PostalAddress", addressLocality: "Nairobi", addressCountry: "KE" },
};

// Three steps that hold for every live service (proposal 4.2). Towing is
// said as it works today: CRAL quotes it and it is settled on the call.
const STEPS: Step[] = [
  {
    title: "Tell us what you need",
    body: "Your dates for a car, a machine or a driver. The route and the load for a truck. What your car needs for a garage. Where you are for a tow.",
  },
  {
    title: "Agree the price first",
    body: "You see the owner's rate, or a quote you accept, before anything is booked. Once agreed, it does not change.",
  },
  {
    title: "Pay through CRAL by M-Pesa",
    body: "You pay only after a yes, and the supplier is paid after the job. A tow is the exception for now: CRAL quotes it and you settle it on the call.",
  },
];

export function Home(): JSX.Element {
  useSeo({
    title: null,
    description:
      "Everything a vehicle needs in Kenya, in one place: hire a car, a truck, machinery or a driver, get a car fixed, or call a tow. Every supplier is checked by a person and every price is agreed before you pay.",
    path: "/",
    jsonLd: ORG_JSON_LD,
  });

  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);

  return (
    <div>
      <section
        className="cral-front-hero"
        style={{
          position: "relative",
          overflow: "hidden",
          background: "#0B0F1A",
          // Top padding is `.cral-front-hero` in index.css: it clears the
          // fixed masthead, whose height changes at 960px.
          paddingLeft: "clamp(16px,4vw,40px)",
          paddingRight: "clamp(16px,4vw,40px)",
          paddingBottom: "clamp(32px,5vw,64px)",
        }}
      >
        <div
          style={{
            position: "relative",
            maxWidth: 1240,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "clamp(28px,4.4vw,64px)",
          }}
        >
          <div style={{ flex: "1 1 460px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <span
                aria-hidden="true"
                style={{ display: "block", width: 24, height: 6, background: "#D81E32", transform: "skewX(-14deg)", flex: "none" }}
              />
              <span style={{ font: "500 10px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".13em", color: "#A7B0BE" }}>
                CRAL · CRUZ RIDE AUTO LIMITED
              </span>
            </div>
            <h1
              style={{
                margin: "0 0 18px",
                font: "700 clamp(34px,5.4vw,64px)/1.02 Archivo,sans-serif",
                fontVariationSettings: "'wdth' 112",
                letterSpacing: "-.034em",
                color: "#FFFFFF",
                maxWidth: 680,
                textWrap: "balance",
              }}
            >
              Everything cars in Kenya.{" "}
              <span style={{ color: "#A7B0BE" }}>Hire a car, a truck or a driver. Get a car fixed. Call a tow.</span>
            </h1>
            <p
              style={{
                margin: 0,
                font: "400 clamp(15px,1.7vw,17px)/1.6 'Instrument Sans',sans-serif",
                color: "#C7CEDA",
                maxWidth: 520,
                textWrap: "pretty",
              }}
            >
              Every supplier checked by a person, every price agreed before you pay.
            </p>
          </div>
          <div style={{ flex: "1 1 360px", minWidth: 0, maxWidth: 520 }}>
            <ServiceDoors />
          </div>
        </div>
      </section>

      <TrustStrip />
      <HowItWorksSteps id="how" overline="HOW CRAL WORKS" heading="The same three steps, whatever you need." steps={STEPS} />
      <ComingServices />
      <EarnBand
        heading="Cars, trucks, machinery or driving."
        body="Earn from what you already have. A person checks your papers once, you set your rates, and CRAL pays you after each job."
      />
    </div>
  );
}

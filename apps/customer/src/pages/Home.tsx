import { useSeo } from "../lib/use-seo.js";
import { LIVE_SERVICES } from "../lib/services.js";
import { ServiceDoors } from "../components/subsite/ServiceDoors.js";
import { TrustStrip } from "../components/subsite/TrustStrip.js";
import { Section } from "../components/subsite/Section.js";
import { HireSearchBox } from "../components/hire/HireSearchBox.js";

/**
 * The front door. Since PR H4 (docs/plans/hire-search-first.md, owner's
 * call 2026-11-26: "I don't want to read content, I immediately want to
 * hire") it opens with the hire search - Type, County, dates, Search -
 * and submitting lands on `/hire` results with those filled in. Below it,
 * only the trust strip and the other live services as doors. "How CRAL
 * works", "Coming to CRAL" and the earn band were cut.
 *
 * "Buy and sell" goes above the hire search once its pages exist
 * (docs/plans/buy-and-sell-cars.md, CS3b). Until then it is not on this
 * page at all: no door to a page that does not exist.
 *
 * Not from a canvas; built from tokens.ts. The doors and the trust points
 * follow the Website canvas's `doors` and `trustCols` (see ServiceDoors.tsx
 * and TrustStrip.tsx).
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

const OTHER_SERVICES = LIVE_SERVICES.filter((s) => !s.menu);

export function Home(): JSX.Element {
  useSeo({
    title: null,
    description:
      "Hire a car, a truck or machinery in Kenya from owners CRAL has checked. Also hire a driver, get a car fixed, buy a part or call a tow. Every price is agreed before you pay.",
    path: "/",
    jsonLd: ORG_JSON_LD,
  });

  return (
    <div>
      <section
        className="cral-front-hero"
        style={{
          position: "relative",
          background: "#0B0F1A",
          // Top padding is `.cral-front-hero` in index.css: it clears the
          // fixed masthead, whose height changes at 960px.
          paddingLeft: "clamp(16px,4vw,40px)",
          paddingRight: "clamp(16px,4vw,40px)",
          paddingBottom: "clamp(32px,5vw,64px)",
        }}
      >
        <div style={{ maxWidth: 1040, margin: "0 auto", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span
              aria-hidden="true"
              style={{
                display: "block",
                width: 24,
                height: 6,
                background: "#D81E32",
                transform: "skewX(-14deg)",
                flex: "none",
              }}
            />
            <span
              style={{
                font: "500 10px/1.3 'IBM Plex Mono',monospace",
                letterSpacing: ".13em",
                color: "#A7B0BE",
              }}
            >
              CARS · TRUCKS · MACHINERY
            </span>
          </div>
          <h1
            style={{
              margin: "0 0 10px",
              font: "700 clamp(30px,4.6vw,52px)/1.04 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 112",
              letterSpacing: "-.032em",
              color: "#FFFFFF",
              textWrap: "balance",
            }}
          >
            What do you want to hire?
          </h1>
          <p
            style={{
              margin: "0 0 clamp(20px,3vw,28px)",
              font: "400 clamp(15px,1.7vw,17px)/1.55 'Instrument Sans',sans-serif",
              color: "#C7CEDA",
              maxWidth: 560,
              textWrap: "pretty",
            }}
          >
            From owners CRAL has checked. Sending a request is free; you pay by M-Pesa once the
            owner says yes.
          </p>
          <HireSearchBox />
        </div>
      </section>

      <TrustStrip />
      <Section overline="ALSO ON CRAL" heading="More for your vehicle.">
        <ServiceDoors services={OTHER_SERVICES} tone="light" heading={null} columns />
      </Section>
    </div>
  );
}

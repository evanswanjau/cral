import { Link } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, SectionTitle, Body, Card } from "../components/site/marketing.js";

/**
 * How it works, for every live service (UI7, proposal 1.1 rows F2 and
 * G8). Not from a canvas; built from tokens.ts in the marketing-page idiom.
 *
 * Facts only from how the product works today (docs/decisions/
 * bookings-payouts.md, trucks.md, drivers.md, services.md): a request is
 * free; the owner has twelve hours to answer; M-Pesa once they accept;
 * the handover code goes out by email; a truck priced per km or tonne (or
 * an owner who quotes first) sends a price that holds for 48 hours;
 * towing is quoted by a person at CRAL and settled on the call.
 */

interface Flow {
  key: string;
  title: string;
  href: string;
  cta: string;
  steps: string[];
}

const FLOWS: Flow[] = [
  {
    key: "hire",
    title: "Hire a car or machinery",
    href: "/hire?type=cars",
    cta: "Hire a car",
    steps: [
      "Search a county and your dates. You only see listings that are free on those days, from owners CRAL has checked.",
      "Send a request with a note if you like. Sending it is free.",
      "The owner has twelve hours to accept. If they decline or don't answer, the request lapses and you have paid nothing.",
      "Once they accept, an M-Pesa prompt comes to your phone. CRAL emails you a handover code; give it to the owner at pickup and the hire begins.",
    ],
  },
  {
    key: "trucks",
    title: "Hire a truck",
    href: "/hire?type=trucks",
    cta: "Hire a truck",
    steps: [
      "Say where the load starts, where it goes and what it is, and pick a truck.",
      "Send the request. Sending it is free.",
      "Where the truck is priced per day or per trip, you see the total before you send. Where it is priced per km or per tonne, or the owner quotes first, the owner sends a price that holds for 48 hours.",
      "Accept the price and pay by M-Pesa. Nothing is charged before you accept.",
    ],
  },
  {
    key: "drivers",
    title: "Hire a driver",
    href: "/drivers",
    cta: "Find a driver",
    steps: [
      "Pick a driver and say the days, or the hours or trip, and the car they will drive. Your own insurance needs to cover another driver.",
      "Send the request. It is free, and needs your phone confirmed and your ID on file.",
      "The owner the driver works for has twelve hours to accept, and you pay by M-Pesa once they do.",
    ],
  },
  {
    key: "towing",
    title: "Call a tow",
    href: "/towing",
    cta: "Call a tow",
    steps: [
      "Say what happened, where the vehicle is and where it should go.",
      "A person at CRAL finds a tow and sends the price, or calls you to agree it.",
      "Nothing is dispatched until you accept. If you are not safe where you are, call CRAL straight away.",
    ],
  },
];

export function HowItWorks(): JSX.Element {
  useSeo({
    title: "How it works",
    description:
      "How hiring a car, machinery, a truck or a driver, and calling a tow, work on CRAL. A request is free, and you pay by M-Pesa only once the price is agreed.",
    path: "/how-it-works",
  });

  return (
    <div>
      <PageHero
        kicker="HOW IT WORKS"
        title="A request is free. You pay once the price is agreed."
        sub="Every service on CRAL starts the same way: you say what you need, a checked supplier or CRAL itself answers, and money moves only after you accept."
      />
      {FLOWS.map((f, i) => (
        <Section key={f.key} tint={i % 2 === 1}>
          <SectionTitle>{f.title}</SectionTitle>
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {f.steps.map((s, n) => (
              <Card key={s}>
                <div style={{ display: "flex", gap: 14 }}>
                  <div
                    style={{
                      font: "700 20px/1 Archivo,sans-serif",
                      fontVariationSettings: "'wdth' 108",
                      color: "#D81E32",
                      flex: "none",
                      width: 34,
                    }}
                  >
                    {String(n + 1).padStart(2, "0")}
                  </div>
                  <p style={{ margin: 0, font: "400 14.5px/1.6 'Instrument Sans',sans-serif", color: "#333B4A" }}>{s}</p>
                </div>
              </Card>
            ))}
          </div>
          <Link to={f.href} style={{ color: "#0F23A8", font: "600 14px/1 'Instrument Sans',sans-serif", display: "inline-flex", alignItems: "center", minHeight: 44 }}>
            {f.cta}
          </Link>
        </Section>
      ))}
      <Section>
        <Body>
          See{" "}
          <Link to="/how-we-protect-you" style={{ color: "#0F23A8" }}>
            how we protect you
          </Link>{" "}
          for what CRAL checks before anyone appears on the site.
        </Body>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          <Link
            to="/"
            style={{
              height: 44,
              padding: "0 19px",
              display: "inline-flex",
              alignItems: "center",
              background: "#0F23A8",
              color: "#FFFFFF",
              borderRadius: 8,
              font: "600 14px/1 'Instrument Sans',sans-serif",
              textDecoration: "none",
            }}
          >
            Pick a service
          </Link>
        </div>
      </Section>
    </div>
  );
}

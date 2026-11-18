import { Link } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, SectionTitle, Body, Card } from "../components/site/marketing.js";

/**
 * How we protect you, for every live service (UI7). Not from a canvas;
 * built from tokens.ts in the marketing-page idiom. Each claim maps to a
 * check the product runs today (docs/decisions/merchant-portal.md,
 * drivers.md, bookings-payouts.md, payments.md, services.md).
 */
const PILLARS: Array<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "Read before it is listed",
    body: "A vehicle's logbook and insurance, and the owner's ID and KRA PIN, are read by a person before a car, truck or machine appears on CRAL. When the insurance lapses, the listing comes off the site until it is renewed.",
  },
  {
    n: "02",
    title: "Drivers checked the same way",
    body: "A driver's licence and ID are read by CRAL before they appear, and every driver works for an owner CRAL has approved. You see their name, county and rates; their documents stay private.",
  },
  {
    n: "03",
    title: "Your identity, checked once",
    body: "You add your ID (and your driving licence to drive yourself) once, before your first request. The owner sees your name and that you are checked, never the documents themselves.",
  },
  {
    n: "04",
    title: "The price is agreed before you pay",
    body: "You see the total, or accept a quote, before any money moves. You pay CRAL by M-Pesa, and the owner is paid by CRAL after the job, not before.",
  },
  {
    n: "05",
    title: "A record either side can open",
    body: "The request, the price, the handover code and the booking's history live in one place. If something goes wrong, you report it from the booking and CRAL judges it on that record.",
  },
];

export function HowWeProtectYou(): JSX.Element {
  useSeo({
    title: "How we protect you",
    description:
      "Every vehicle's papers and every driver's licence are read by a person before they appear on CRAL. Your identity is checked once, and the price is agreed before you pay.",
    path: "/how-we-protect-you",
  });

  return (
    <div>
      <PageHero
        kicker="HOW WE PROTECT YOU"
        title="A person reads the papers before anyone appears here."
        sub="Cars, trucks, machinery and drivers are all checked by CRAL before you can book them, the money goes through CRAL, and every booking keeps a record both sides can open."
      />
      <Section>
        <div style={{ display: "grid", gap: 12 }}>
          {PILLARS.map((p) => (
            <Card key={p.n}>
              <div style={{ display: "flex", gap: 16 }}>
                <div
                  style={{
                    font: "700 22px/1 Archivo,sans-serif",
                    fontVariationSettings: "'wdth' 108",
                    color: "#D81E32",
                    flex: "none",
                    width: 40,
                  }}
                >
                  {p.n}
                </div>
                <div>
                  <div style={{ font: "600 16px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 6 }}>
                    {p.title}
                  </div>
                  <p style={{ margin: 0, font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                    {p.body}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>
      <Section tint>
        <SectionTitle>A cleared document set is not a mechanical inspection</SectionTitle>
        <Body>
          Verification confirms a vehicle's papers are in order and match the owner - it isn't a
          roadworthiness check. Look the vehicle over yourself at handover.
        </Body>
        <Body>
          The price is agreed before you pay, and it doesn't change after that. See{" "}
          <Link to="/how-it-works" style={{ color: "#0F23A8" }}>
            how it works
          </Link>{" "}
          for how each service runs, from request to handover.
        </Body>
      </Section>
    </div>
  );
}

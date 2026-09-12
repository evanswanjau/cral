import { Link } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, SectionTitle, Body, Card } from "../components/site/marketing.js";

const PILLARS: Array<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "Read before it is listed",
    body: "A car's logbook, insurance and tracker certificate, and the owner's ID and KRA PIN, are checked by a person before that car appears in search. A listing comes off the site the moment any of them lapses.",
  },
  {
    n: "02",
    title: "Your identity, checked once",
    body: "You upload your national ID and driving licence once, before your first request. CRAL reads them; the owner sees a name and a checked status, never the documents themselves.",
  },
  {
    n: "03",
    title: "Agreed up front, not argued over later",
    body: "The rate and any deposit are set on the listing and agreed before you book, so there's no dispute about the number when you collect the car.",
  },
  {
    n: "04",
    title: "A record either side can open",
    body: "The booking, the request timeline and (once handover is built) the pickup and return photos live in one place. If something is disputed, it's judged on that record, not on whoever argues louder.",
  },
];

export function HowWeProtectYou(): JSX.Element {
  useSeo({
    title: "How we protect you",
    description:
      "Every listing's documents are read by a person. Your identity is checked once. The rate and deposit are agreed with the owner, not held by CRAL.",
    path: "/how-we-protect-you",
  });

  return (
    <div>
      <PageHero
        kicker="HOW WE PROTECT YOU"
        title="The deposit is agreed with the owner, not held by us."
        sub="Kenya's oldest car-hire argument is who keeps the money after a scratch. CRAL doesn't sit in the middle of it - what CRAL does is make sure both sides are who they say they are, and that there's a record if it ever comes to that."
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
          Verification confirms a car's papers are in order and match the owner - it isn't a
          roadworthiness check. Look the car over yourself before you sign anything.
        </Body>
        <Body>
          There is no payment rail live on Cruz Ride Auto yet, so no deposit is collected or held
          by CRAL today - that is set on the listing and settled directly with the owner. See{" "}
          <Link to="/how-it-works" style={{ color: "#0F23A8" }}>
            how it works
          </Link>{" "}
          for the full request-to-collection flow.
        </Body>
      </Section>
    </div>
  );
}

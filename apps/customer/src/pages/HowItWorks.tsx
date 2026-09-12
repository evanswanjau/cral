import { Link } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, SectionTitle, Body, Card } from "../components/site/marketing.js";

const STEPS: Array<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "Search cars that are genuinely free on your dates",
    body: "Every result on Cruz Ride Auto is a live listing on an approved owner - a paused or unreviewed car never shows up, and a car already booked for your dates is filtered out automatically.",
  },
  {
    n: "02",
    title: "Send a request. Nothing is charged.",
    body: "Pick your dates, add a note if you like, and send it. No card, no M-Pesa prompt, no booking fee - CRAL doesn't charge one, ever.",
  },
  {
    n: "03",
    title: "The owner has twelve hours to answer",
    body: "You'll hear back by email either way. If they decline, or go quiet, the request simply lapses and you've paid nothing. You can send requests for other cars over the same dates while you wait - you only ever pay for the one you confirm.",
  },
  {
    n: "04",
    title: "Collect the car, settle up directly",
    body: "The rate and any deposit are agreed with the owner and settled when you collect. CRAL's part is the record: your licence and ID read once, the booking and its history kept in one place either of you can open.",
  },
];

export function HowItWorks(): JSX.Element {
  useSeo({
    title: "How it works",
    description:
      "Search, request, get an answer within twelve hours, and collect. No booking fee, nothing charged until the owner accepts.",
    path: "/how-it-works",
  });

  return (
    <div>
      <PageHero
        kicker="HOW IT WORKS"
        title="Four steps, and you never pay a booking fee."
        sub="Searching, requesting and hearing back all happen before any money is involved."
      />
      <Section>
        <div style={{ display: "grid", gap: 12 }}>
          {STEPS.map((s) => (
            <Card key={s.n}>
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
                  {s.n}
                </div>
                <div>
                  <div style={{ font: "600 16px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 6 }}>
                    {s.title}
                  </div>
                  <p style={{ margin: 0, font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                    {s.body}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>
      <Section tint>
        <SectionTitle>What CRAL doesn't do</SectionTitle>
        <Body>
          There's no payment collected through Cruz Ride Auto today, and no deposit held by CRAL -
          the rate and any deposit are between you and the owner, agreed before you book. See{" "}
          <Link to="/how-we-protect-you" style={{ color: "#0F23A8" }}>
            how we protect you
          </Link>{" "}
          for what CRAL does check.
        </Body>
      </Section>
      <Section>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            to="/browse"
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
            Find a car
          </Link>
        </div>
      </Section>
    </div>
  );
}

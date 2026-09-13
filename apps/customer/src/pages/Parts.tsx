import { Link } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, Body } from "../components/site/marketing.js";

export function Parts(): JSX.Element {
  useSeo({
    title: "Find parts",
    description: "Genuine and quality vehicle parts on Cruz Ride Auto - coming soon.",
    path: "/parts",
  });

  return (
    <div>
      <PageHero
        kicker="FIND PARTS"
        title="Parts are coming to Cruz Ride Auto."
        sub="We're building the same document-checked, no-surprises marketplace for vehicle parts. Hiring a car is live today."
      />
      <Section>
        <Body>
          When it launches, parts on Cruz Ride Auto will follow the same idea as hiring a car -
          listings checked before they go live, and a record either side can open.
        </Body>
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
          Find a car instead
        </Link>
      </Section>
    </div>
  );
}

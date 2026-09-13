import { Link } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, Body } from "../components/site/marketing.js";

export function Services(): JSX.Element {
  useSeo({
    title: "Find services",
    description: "Book vetted garages and vehicle services on Cruz Ride Auto - coming soon.",
    path: "/services",
  });

  return (
    <div>
      <PageHero
        kicker="FIND SERVICES"
        title="Vehicle services are coming to Cruz Ride Auto."
        sub="Book a garage CRAL has vetted, with the quote agreed before anyone lifts a spanner. Hiring a car is live today."
      />
      <Section>
        <Body>
          When it launches, services will follow the same idea as hiring a car - vetted providers,
          an agreed price up front, and a record either side can open.
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

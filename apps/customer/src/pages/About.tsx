import { Link } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, SectionTitle, Body } from "../components/site/marketing.js";

export function About(): JSX.Element {
  useSeo({
    title: "About CRAL",
    description: "Cruz Ride Auto is building the place Kenyans go for anything to do with a car. Hiring is live today.",
    path: "/about",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Cruz Ride Auto Limited",
      url: "https://cral.co.ke",
      email: "hello@cral.co.ke",
      telephone: "+254735656066",
      address: { "@type": "PostalAddress", addressLocality: "Nairobi", addressCountry: "KE" },
    },
  });

  return (
    <div>
      <PageHero
        kicker="ABOUT CRAL"
        title="Everything cars in Kenya. We start with the keys."
        sub="Cruz Ride Auto is building the place Kenyans go for anything to do with a car - starting with hiring one."
      />
      <Section>
        <SectionTitle>What's live today</SectionTitle>
        <Body>
          Hiring is live: search a live-reviewed car, send a request, hear back within twelve
          hours, and collect - all with no booking fee. Every listing's documents are read by a
          person before it goes live, and every renter's ID and licence are checked once.
        </Body>
        <SectionTitle>What's next</SectionTitle>
        <Body>
          Cars by the month for families and companies, vetted service and repair, buying and
          selling, and insurance and paperwork handled inside the account you already have - all
          pointed at the same idea: the same read documents and the same record, wherever your car
          needs something next.
        </Body>
      </Section>
      <Section tint>
        <SectionTitle>Have a car of your own?</SectionTitle>
        <Body>
          Put it to work on the days you're not using it.{" "}
          <Link to="/list-your-car" style={{ color: "#0F23A8" }}>
            List your car
          </Link>
          .
        </Body>
      </Section>
    </div>
  );
}

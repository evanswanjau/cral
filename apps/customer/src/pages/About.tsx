import { useSeo } from "../lib/use-seo.js";
import { merchantLandingUrl } from "../lib/merchant-app.js";
import { PageHero, Section, SectionTitle, Body } from "../components/site/marketing.js";

export function About(): JSX.Element {
  useSeo({
    title: "About CRAL",
    description: "Cruz Ride Auto is one place for everything a vehicle needs in Kenya. Car, truck, machinery and driver hire, and towing, are live today.",
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
        title="One place for everything a vehicle needs in Kenya."
        sub="Cruz Ride Auto checks every supplier, agrees every price before work starts, and moves the money by M-Pesa."
      />
      <Section>
        <SectionTitle>What's live today</SectionTitle>
        <Body>
          Hire a car, machinery, a truck or a driver, get a car fixed, buy a part, or call a tow. A request is
          free, owners answer within twelve hours, and you pay by M-Pesa only once the price is
          agreed. Every vehicle's papers and every driver's licence are read by a person before
          they appear, every garage is visited before it can quote, parts dealers quote against
          your chassis number, and every renter's ID is checked once.
        </Body>
        <SectionTitle>What's next</SectionTitle>
        <Body>
          Buying and selling cars with the logbook read against the car - all inside the account you already have, with the same checked suppliers and the
          same record.
        </Body>
      </Section>
      <Section tint>
        <SectionTitle>Have a vehicle, or drive for a living?</SectionTitle>
        <Body>
          Cars, trucks, machinery and drivers all earn on CRAL, and listing is free.{" "}
          <a href={merchantLandingUrl()} style={{ color: "#0F23A8" }}>
            Earn with CRAL
          </a>
          .
        </Body>
      </Section>
    </div>
  );
}

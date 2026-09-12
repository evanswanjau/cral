import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, SectionTitle, Body } from "../components/site/marketing.js";

/**
 * Deliberately NOT a full Terms of Service / Privacy Policy. Writing
 * fabricated legal text and presenting it as CRAL's real terms would be
 * a worse version of the fabricated id_verified badge - this is the one
 * page on the site where invented content has actual legal consequences.
 * This states what's true (the marketplace disclaimer already used in
 * the footer, and what data the product actually collects) and says
 * plainly that the full terms need real legal drafting before launch.
 */
export function Legal(): JSX.Element {
  useSeo({
    title: "Terms and privacy",
    description: "How Cruz Ride Auto works as a marketplace, and what happens to your data.",
    path: "/legal",
  });

  return (
    <div>
      <PageHero kicker="TERMS & PRIVACY" title="Terms and privacy" />
      <Section>
        <SectionTitle>CRAL is a marketplace</SectionTitle>
        <Body>
          Hire agreements are between the renter and the vehicle owner. CRAL reviews listing
          documents and renter identity, and keeps a record of each booking, but is not a party to
          the hire itself.
        </Body>
        <SectionTitle>What CRAL holds</SectionTitle>
        <Body>
          Your account details, the identity documents you upload (read by CRAL, never shown to
          the owner directly), and your booking history. There is no payment rail live yet, so no
          payment or deposit is collected or held by CRAL today.
        </Body>
        <SectionTitle>The rest is coming</SectionTitle>
        <Body>
          Full terms of service and a privacy policy are being drafted and will replace this page
          before Cruz Ride Auto takes its first real payment. If you have a question about your
          data in the meantime, email{" "}
          <a href="mailto:hello@cral.co.ke" style={{ color: "#0F23A8" }}>
            hello@cral.co.ke
          </a>
          .
        </Body>
      </Section>
    </div>
  );
}

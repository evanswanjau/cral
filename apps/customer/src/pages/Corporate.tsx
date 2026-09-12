import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, SectionTitle, Body, Card } from "../components/site/marketing.js";

/**
 * Corporate hire is a get-in-touch page, not a self-serve flow - there is
 * no company billing, invoicing, or multi-driver account built yet.
 * Saying otherwise here would be exactly the kind of promise the rest of
 * this product goes out of its way not to make.
 */
export function Corporate(): JSX.Element {
  useSeo({
    title: "Corporate hire",
    description: "Hiring cars for a team or a company - get in touch and CRAL will work out what fits.",
    path: "/corporate",
  });

  return (
    <div>
      <PageHero
        kicker="CORPORATE"
        title="Hiring for a team, not just a trip."
        sub="A company wanting to hire regularly - for staff, for a project, for visiting clients - works with CRAL a little differently than a one-off request."
      />
      <Section>
        <Card>
          <SectionTitle>This is a conversation, not a form</SectionTitle>
          <Body>
            Company billing, invoicing and multi-driver accounts aren't self-serve on Cruz Ride
            Auto yet. If your company wants to hire regularly, email{" "}
            <a href="mailto:hello@cral.co.ke" style={{ color: "#0F23A8" }}>
              hello@cral.co.ke
            </a>{" "}
            or call{" "}
            <a href="tel:+254735656066" style={{ color: "#0F23A8" }}>
              +254 735 656066
            </a>{" "}
            and CRAL will work out what fits - a standing arrangement with an owner, several
            individual bookings, or something else.
          </Body>
        </Card>
      </Section>
      <Section tint>
        <SectionTitle>What stays the same</SectionTitle>
        <Body>
          Every car a company hires goes through the same document check as any other listing, and
          every driver still needs their own licence read once. Corporate hire changes how billing
          is arranged, not how a car is verified.
        </Body>
      </Section>
    </div>
  );
}

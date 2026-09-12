import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, Card } from "../components/site/marketing.js";

/**
 * No contact form - there is nothing to receive it. A form with no
 * backend behind it (or worse, one that silently emails nowhere real)
 * is a fake "we'll get back to you". Direct email and phone are real.
 */
export function Contact(): JSX.Element {
  useSeo({
    title: "Contact us",
    description: "Reach Cruz Ride Auto by email or phone.",
    path: "/contact",
  });

  return (
    <div>
      <PageHero kicker="CONTACT" title="Get in touch" />
      <Section>
        <Card>
          <div style={{ font: "600 15px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 6 }}>
            Email
          </div>
          <a
            href="mailto:hello@cral.co.ke"
            style={{ font: "500 15px/1.6 'IBM Plex Mono',monospace", color: "#0F23A8" }}
          >
            hello@cral.co.ke
          </a>
        </Card>
        <Card>
          <div style={{ font: "600 15px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 6 }}>
            Phone
          </div>
          <a
            href="tel:+254735656066"
            style={{ font: "500 15px/1.6 'IBM Plex Mono',monospace", color: "#0F23A8" }}
          >
            +254 735 656066
          </a>
        </Card>
        <Card>
          <div style={{ font: "600 15px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 6 }}>
            Based in
          </div>
          <div style={{ font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>Nairobi, Kenya</div>
        </Card>
      </Section>
    </div>
  );
}

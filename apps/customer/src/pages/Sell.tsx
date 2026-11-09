import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { useIsAuthenticated } from "../lib/auth.js";
import { merchantLandingUrl } from "../lib/merchant-app.js";
import { PageHero, Section, Card, Body, SectionTitle } from "../components/site/marketing.js";
import { myListings } from "../lib/sales-api.js";
import { Button } from "../components/sale/ui.js";

/**
 * Sell a car - the website canvas's `selling` vertical
 * (`Cruz Ride Auto - Website.dc.html`, `vertDefs.selling`), now real.
 * The kicker, title, sub and the three points are the canvas copy
 * verbatim; the "notify me" ask box it carried while the vertical was
 * "IN BUILD" is replaced by the real way in. Built in the marketing
 * pages' token idiom, since the canvas renders verticals through the same
 * shared template.
 */
const POINTS = [
  {
    n: "01",
    title: "Read before it is listed",
    body: "Logbook, ID and the eight photographs we specify. Names and chassis numbers have to agree before the advert appears at all.",
  },
  {
    n: "02",
    title: "Faults stated up front",
    body: "Sellers fill in a short known-faults block. It is required, and it is the reason buyers believe the rest of the advert.",
  },
  {
    n: "03",
    title: "You deal directly",
    body: "CRAL never holds the money or takes a commission. Free listing, and the buyer meets the seller.",
  },
];

export function Sell(): JSX.Element {
  useSeo({
    title: "Sell your car",
    description: "Free listings, and CRAL reads the logbook against the car before the advert goes live. No deposits held, no cut of your sale.",
    path: "/sell",
  });
  const signedIn = useIsAuthenticated();
  const { data } = useQuery({ queryKey: ["my-sale-listings"], queryFn: myListings, enabled: signedIn });
  const isMerchant = data?.seller.type === "merchant";

  return (
    <div>
      <PageHero
        kicker="BUY AND SELL"
        title="Nobody should buy a logbook that does not match the car."
        sub="Free listings for individuals and dealers alike, and CRAL reads the logbook against the car before the advert goes live. No deposits held, no cut of your sale."
      />
      <Section>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
          {isMerchant ? (
            <a href={merchantLandingUrl()} style={{ textDecoration: "none" }}>
              <Button>Sell from your merchant account</Button>
            </a>
          ) : (
            <Link to="/sell/new" style={{ textDecoration: "none" }}>
              <Button>List a car for sale</Button>
            </Link>
          )}
          {signedIn && data && data.data.length > 0 && !isMerchant && (
            <Link to="/my-listings" style={{ textDecoration: "none" }}>
              <Button variant="secondary">Your listings ({data.data.length})</Button>
            </Link>
          )}
          <Link to="/buy" style={{ textDecoration: "none" }}>
            <Button variant="secondary">Browse cars for sale</Button>
          </Link>
        </div>
        {POINTS.map((p) => (
          <Card key={p.n}>
            <div style={{ display: "flex", gap: 16 }}>
              <span style={{ font: "500 13px/1.6 'IBM Plex Mono',monospace", color: "#0F23A8" }}>{p.n}</span>
              <div>
                <div style={{ font: "600 16px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 4 }}>{p.title}</div>
                <Body>{p.body}</Body>
              </div>
            </div>
          </Card>
        ))}
      </Section>
      <Section tint>
        <SectionTitle>What you need</SectionTitle>
        <Body>
          Your national ID on your CRAL account (checked once), a verified phone number, the car's logbook, and eight photos: front and rear with
          the plate showing, both sides, the front and rear seats, the odometer with the engine running, and the engine bay with the chassis plate.
        </Body>
        <Body>
          A private account can have two cars for sale at once. Selling more than that is a dealership - list them from a merchant account instead.
          Adverts run for 60 days and renew in one tap.
        </Body>
      </Section>
    </div>
  );
}

import { useNavigate } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { VerticalPage, type VerticalDef } from "../components/site/VerticalPage.js";

/** `vertDefs.services` from `docs/brand/canvas/Cruz Ride Auto - Website.dc.html`, verbatim. */
const DEF: VerticalDef = {
  kicker: "SERVICE AND REPAIR",
  status: "OPENING SOON",
  title: "A garage that agrees the price before it lifts a spanner.",
  sub: "Book a vetted garage for a service, a diagnostic or a repair. The quote is written into CRAL before work starts, and nothing is added to it without you saying yes.",
  ask: "What does the car need?",
  askPlaceholder: "Full service and brake pads, X-Trail 2019",
  points: [
    {
      n: "01",
      title: "Quote first, work after",
      body: "Parts, labour and days, itemised in the booking. Anything found mid-job comes back as a second quote, not a bigger bill at the gate.",
    },
    {
      n: "02",
      title: "Garages are visited",
      body: "A person inspects a garage before it is listed, and the listing comes down when the work stops matching the quotes.",
    },
    {
      n: "03",
      title: "One service record per car",
      body: "Every job on a car CRAL knows is kept with it, which is exactly what a buyer asks for two years later.",
    },
  ],
};

export function Services(): JSX.Element {
  const navigate = useNavigate();
  useSeo({
    title: "Find services",
    description: "Book vetted garages and vehicle services on Cruz Ride Auto - opening soon.",
    path: "/services",
  });

  return <VerticalPage def={DEF} onFindCar={() => navigate("/browse")} />;
}

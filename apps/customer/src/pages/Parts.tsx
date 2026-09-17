import { useNavigate } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { VerticalPage, type VerticalDef } from "../components/site/VerticalPage.js";

/** `vertDefs.parts` from `docs/brand/canvas/Cruz Ride Auto - Website.dc.html`, verbatim. */
const DEF: VerticalDef = {
  kicker: "PARTS",
  status: "OPENING SOON",
  title: "Parts that match your car, not just your model year.",
  sub: "Genuine, OEM and honest used parts from dealers CRAL has read the papers on. They quote against your chassis number instead of guessing, and it arrives fitted or delivered.",
  ask: "What part do you need?",
  askPlaceholder: "Front left shock absorber, Fielder 2018",
  points: [
    {
      n: "01",
      title: "Quoted against your chassis",
      body: "No more choosing between three shock absorbers that all claim to fit a Fielder. The dealer quotes off the logbook CRAL already holds for your car.",
    },
    {
      n: "02",
      title: "Sellers are read first",
      body: "The same document review car owners go through: registration, KRA PIN and an address a person has visited. A dealer with no premises does not get listed.",
    },
    {
      n: "03",
      title: "Paid on arrival, not on promise",
      body: "You pay CRAL by M-Pesa. The dealer is paid once the part is in your hands and it is the right one.",
    },
  ],
};

export function Parts(): JSX.Element {
  const navigate = useNavigate();
  useSeo({
    title: "Find parts",
    description: "Genuine and quality vehicle parts on Cruz Ride Auto - opening soon.",
    path: "/parts",
  });

  return <VerticalPage def={DEF} onFindCar={() => navigate("/browse")} />;
}

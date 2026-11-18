import { useSeo } from "../../lib/use-seo.js";
import { getService, type LiveService } from "../../lib/services.js";
import { SubsiteHero } from "../../components/subsite/SubsiteHero.js";
import { TruckSearch } from "../../components/subsite/TruckSearch.js";
import { HowItWorksSteps, type Step } from "../../components/subsite/HowItWorksSteps.js";
import { PriceExplainer, type PriceRow } from "../../components/subsite/PriceExplainer.js";
import { FaqList, type Faq } from "../../components/subsite/FaqList.js";
import { EarnBand } from "../../components/subsite/EarnBand.js";
import { TruckRail } from "../../components/trucks/TruckRail.js";

/**
 * `/trucks`: the truck-hire landing (UI2a). It starts with the job - where
 * the load goes from and to, what it weighs, what truck - instead of the
 * car-hire dates. The search goes to `/trucks/search?...`, a truck opens
 * at `/trucks/:id` and the request is `/trucks/:id/request`.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.3 (Trucks column) and 5.3.
 *
 * Every line of copy holds to how trucks work today (docs/decisions/trucks.md):
 * per km and per tonne are guides and CRAL never computes a distance; a
 * quote has 12 hours to arrive and holds for 48; a load over the truck's
 * capacity is refused; loaders are not a field, so they go in the note.
 * The customer's price only - nothing here about CRAL's cut.
 */

const STEPS: Step[] = [
  {
    title: "Pick a truck that can carry it",
    body: "Search by county and load. Every truck shows its type and how much it carries, so you only ask the ones that fit.",
  },
  {
    title: "Send the route and load",
    body: "Say where it is collected, where it is going and what it is. Asking is free.",
  },
  {
    title: "The owner quotes, you accept",
    body: "The owner has twelve hours to send a price, and you have until it expires to accept it or say no thanks. A flat-trip truck skips this: the owner just accepts at the listed price.",
  },
  {
    title: "Pay by M-Pesa",
    body: "An M-Pesa prompt comes to your phone. Enter your PIN and the truck is booked.",
  },
];

const PRICES: PriceRow[] = [
  {
    label: "Per trip",
    body: "One flat price for the job, whatever the dates. You see it before you send the request.",
  },
  {
    label: "Per day",
    body: "The daily rate times the days you need the truck, worked out before you send.",
  },
  {
    label: "Per km",
    body: "The owner's rate per kilometre is a guide. CRAL doesn't measure the distance: the price you accept is the owner's quote.",
  },
  {
    label: "Per tonne",
    body: "A rate per tonne carried, also a guide. The owner sees your load and sends the actual price.",
  },
  {
    label: "By quote",
    body: "Some owners price every job themselves, whatever their usual rate. Their trucks say \"By quote\", and you pay nothing until you accept a price.",
  },
  {
    label: "Minimum charge",
    body: "When an owner doesn't go out for less than a set amount, the truck's page says so next to the rate.",
  },
];

const FAQS: Faq[] = [
  {
    q: "Do I pay anything to ask for a price?",
    a: "No. Sending the route and load is free. You pay only once you accept the owner's price, or, for a flat-trip truck, once the owner accepts the job.",
  },
  {
    q: "How long does the owner have to send a price?",
    a: "Twelve hours. A price, once sent, holds for 48 hours. If either runs out, the request lapses and you have paid nothing.",
  },
  {
    q: "Does CRAL work out the distance?",
    a: "No. A per-km or per-tonne rate is the owner's guide. The owner sees your route and load and sends one price, and that is the price you pay.",
  },
  {
    q: "What if my load is heavier than the truck carries?",
    a: "The request won't go. Each truck shows what it carries, so pick a bigger one or split the load into two trips.",
  },
  {
    q: "Does the owner send people to load?",
    a: "Not as standard. If you need hands to load or offload, or a tarpaulin, say so in the note to the owner, and they price it in.",
  },
  {
    q: "How do I pay?",
    a: "By M-Pesa. Once a price is agreed, a prompt comes to your phone. Enter your PIN and the truck is booked.",
  },
];

export function TrucksHome(): JSX.Element {
  useSeo({
    title: "Hire a truck in Kenya",
    description:
      "Tippers, flatbeds and box bodies from owners CRAL has checked. Send the route and load for free, and pay by M-Pesa only once you accept a price.",
    path: "/trucks",
  });
  const service = getService("trucks") as LiveService;

  return (
    <div>
      <SubsiteHero service={service}>
        <TruckSearch />
      </SubsiteHero>
      <HowItWorksSteps heading="From the load to a booked truck in four steps." steps={STEPS} />
      <PriceExplainer heading="Every truck says how it is priced." rows={PRICES} />
      <TruckRail />
      <FaqList heading="Hiring a truck on CRAL" items={FAQS} />
      <EarnBand
        heading="Have a truck that could be working more days?"
        body="List it on CRAL. A person checks the papers, you say how you charge, and you are paid after each job."
        cta="List your truck"
      />
    </div>
  );
}

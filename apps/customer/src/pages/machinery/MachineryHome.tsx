import { useSeo } from "../../lib/use-seo.js";
import { getService, type LiveService } from "../../lib/services.js";
import { SubsiteHero } from "../../components/subsite/SubsiteHero.js";
import { HowItWorksSteps, type Step } from "../../components/subsite/HowItWorksSteps.js";
import { PriceExplainer, type PriceRow } from "../../components/subsite/PriceExplainer.js";
import { FaqList, type Faq } from "../../components/subsite/FaqList.js";
import { EarnBand } from "../../components/subsite/EarnBand.js";
import { CarSearch } from "../../components/cars/CarSearch.js";
import { MachineryRail } from "../../components/machinery/MachineryRail.js";

/**
 * `/machinery`: the machinery-hire landing (UI2b, owner decision 3: site
 * work by the day is a different job from moving a load). Built from the
 * cars pattern: the same county/from/until search, submitting to
 * `/machinery/search?county&from&to`; an item opens at `/machinery/:id`
 * and is booked at `/machinery/:id/book`.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.3 (Machinery column).
 *
 * Copy holds to how machinery hire works today
 * (docs/decisions/bookings-payouts.md): a listing is priced per day or per
 * trip; per hour exists in the data but is switched off, so it is not
 * mentioned. The owner has twelve hours to accept, payment is M-Pesa, and
 * the handover code goes out by email. The customer's price only, never
 * CRAL's cut. The supplier band points at the merchant site's
 * `/join/machinery`, which UI4 builds.
 */

const STEPS: Step[] = [
  {
    title: "Search your dates",
    body: "Pick a county and the days the site needs the machine. You only see machinery that is free on those dates.",
  },
  {
    title: "Send a request",
    body: "Choose the machine and say what the job is in a note to the owner. Sending a request is free.",
  },
  {
    title: "The owner accepts, you pay",
    body: "The owner has twelve hours to say yes. Once they do, an M-Pesa prompt comes to your phone and the hire is confirmed when you pay.",
  },
  {
    title: "Hand over with your code",
    body: "Before the hire starts CRAL emails you a handover code. Give it to the owner when the machine is handed over, and the hire begins.",
  },
];

const PRICES: PriceRow[] = [
  {
    label: "Per day",
    body: "The daily rate times the days you need the machine. The total for your dates is worked out before you send the request.",
  },
  {
    label: "Per trip",
    body: "Some owners price the whole job once, whatever the dates. The listing says \"Per trip\" and shows that one price.",
  },
  {
    label: "Minimum hire",
    body: "When an owner hires out for a few days at a time, the machine's page says so, and the dates won't let you book less.",
  },
  {
    label: "When you pay",
    body: "Nothing is charged for a request. You pay by M-Pesa only after the owner accepts, and the total does not change once they do.",
  },
];

const FAQS: Faq[] = [
  {
    q: "Do I pay anything to send a request?",
    a: "No. Sending a request is free. You pay only once the owner accepts your dates.",
  },
  {
    q: "How long does the owner have to reply?",
    a: "Twelve hours. If they don't accept in that time, the request lapses and you have paid nothing.",
  },
  {
    q: "Does an operator come with the machine?",
    a: "Only where the listing says \"With driver\". Otherwise bring your own operator, or ask the owner in the note on your request.",
  },
  {
    q: "Can the price change after the owner accepts?",
    a: "No. The total you see before you send the request is the total you pay.",
  },
  {
    q: "What does CRAL check before a machine is listed?",
    a: "A person reads the machine's papers, its insurance and the owner's ID before it appears here. When the insurance lapses, the machine comes off the site until it is renewed.",
  },
];

export function MachineryHome(): JSX.Element {
  useSeo({
    title: "Hire machinery in Kenya",
    description:
      "Machinery for site work from owners CRAL has checked. Sending a request is free, and you pay by M-Pesa only once the owner accepts your dates.",
    path: "/machinery",
  });
  const service = getService("machinery") as LiveService;

  return (
    <div>
      <SubsiteHero service={service}>
        <CarSearch searchPath="/machinery/search" noun="machinery" />
      </SubsiteHero>
      <HowItWorksSteps heading="From search to site in four steps." steps={STEPS} />
      <PriceExplainer heading="You see the total before you send." rows={PRICES} />
      <MachineryRail />
      <FaqList heading="Hiring machinery on CRAL" items={FAQS} />
      <EarnBand
        heading="Have machinery standing idle between jobs?"
        body="List it on CRAL. A person checks the papers, you set the rate and the dates, and you are paid after each hire."
        cta="List your machinery"
        joinPath="/join/machinery"
      />
    </div>
  );
}

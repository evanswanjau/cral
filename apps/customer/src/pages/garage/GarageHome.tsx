import { useSeo } from "../../lib/use-seo.js";
import { useIsAuthenticated } from "../../lib/auth.js";
import { getService, type LiveService } from "../../lib/services.js";
import { SubsiteHero } from "../../components/subsite/SubsiteHero.js";
import { HowItWorksSteps, type Step } from "../../components/subsite/HowItWorksSteps.js";
import { PriceExplainer, type PriceRow } from "../../components/subsite/PriceExplainer.js";
import { FaqList, type Faq } from "../../components/subsite/FaqList.js";
import { EarnBand } from "../../components/subsite/EarnBand.js";
import { GarageRequestForm } from "../../components/garage/GarageRequestForm.js";
import { YourGarageRequests } from "../../components/garage/YourGarageRequests.js";

/**
 * `/garage`: the garage services sub-site (Phase 4). GS2 built the request
 * form and quotes, GS3 the paid order; GS4 made it a live service in the
 * registry (masthead tab, front-door door, footer link, sitemap) and wrote
 * the landing out in full. `/services` redirects here.
 *
 * Public, like towing: the request form sits in the hero and survives
 * sign-in; a signed-in customer sees their requests below it. The hero
 * reads the registry's garage entry (the canvas `vertDefs` copy).
 *
 * Copy holds to how garage jobs work today (docs/decisions/garage.md):
 * up to 5 garages in the county that CRAL has visited, itemised quotes
 * valid 48 h, pay CRAL upfront by M-Pesa, extra work as a second quote,
 * confirm or it confirms itself 72 h after ready, problems go to CRAL
 * support who release or refund. Naming one garage is not built, so it is
 * not promised. No count of garages is shown.
 *
 * Not from a canvas; built from tokens.ts and docs/plans/ui-services-proposal.md
 * section 4.3. Hero photo is an Unsplash placeholder (public/images/services/CREDITS.txt).
 */

const STEPS: Step[] = [
  {
    title: "Say what the car needs",
    body: "Pick the car from My cars, the kind of work and your county, and describe the problem in your own words. Asking is free.",
  },
  {
    title: "Garages send itemised prices",
    body: "Up to 5 garages in your county that CRAL has visited get your request. Each one prices it line by line: parts, labour and anything else.",
  },
  {
    title: "Accept one and pay CRAL",
    body: "Pick the quote that suits you and pay by M-Pesa. CRAL holds the money; the garage starts once it has landed.",
  },
  {
    title: "Collect the car and confirm",
    body: "When the garage says the car is ready, check the work and confirm. Only then is the garage paid, and the job stays on the car's service record.",
  },
];

const PRICES: PriceRow[] = [
  {
    label: "Line by line",
    body: "Every quote lists each part and each piece of labour with its own price, so you can see exactly what you are paying for.",
  },
  {
    label: "Valid 48 hours",
    body: "A garage's price stands for 48 hours from when it is sent. If the garage changes it, the 48 hours start again.",
  },
  {
    label: "Paid upfront, held by CRAL",
    body: "You pay the quote you accepted, and not a shilling more. CRAL keeps the money until you confirm the job is done.",
  },
  {
    label: "No surprises at the gate",
    body: "Extra work found on the job comes to you as a second quote. You say yes and pay it, or the garage finishes what you agreed.",
  },
];

const FAQS: Faq[] = [
  {
    q: "Which garages see my request?",
    a: "Up to 5 garages in your county that do the work you picked. Before a garage can quote, someone from CRAL has visited its premises and the visit is on record.",
  },
  {
    q: "Does asking for prices cost anything?",
    a: "No. Asking is free and you are under no obligation to accept any quote. You can close the request at any time.",
  },
  {
    q: "When do I pay, and when is the garage paid?",
    a: "You pay CRAL by M-Pesa when you accept a quote. CRAL holds the money and pays the garage only after you confirm the job is done.",
  },
  {
    q: "What if the garage finds more work to do?",
    a: "It sends you a second quote on CRAL, line by line. Nothing is added to your bill unless you accept it and pay for it. If you say no, the garage finishes the work you agreed.",
  },
  {
    q: "What if I don't confirm the job?",
    a: "Once the garage marks the car ready, you have 72 hours to confirm or raise a problem. If you say nothing, the job confirms itself and the garage is paid.",
  },
  {
    q: "What if something is wrong with the work?",
    a: "Raise a problem on the job before you confirm it. The money stays with CRAL, and CRAL support looks into it and either pays the garage or refunds you.",
  },
  {
    q: "Who sees my chassis number?",
    a: "Only the garages asked to quote on that request, so they price for your exact car. It is never shown publicly.",
  },
  {
    q: "What is the service record?",
    a: "Every job confirmed through CRAL stays on the car, under My cars: what was done, line by line, by which garage and what it cost. A garage sees only the jobs it did itself.",
  },
];

export function GarageHome(): JSX.Element {
  useSeo({
    title: "Car service and repair quotes in Kenya",
    description:
      "Describe what your car needs and get itemised prices from garages CRAL has visited. Pay CRAL by M-Pesa, and the garage is paid only once you confirm the job.",
    path: "/garage",
  });
  const service = getService("garage") as LiveService;
  const isAuthenticated = useIsAuthenticated();

  return (
    <div>
      <SubsiteHero service={service}>
        <GarageRequestForm />
      </SubsiteHero>
      {isAuthenticated && <YourGarageRequests />}
      <HowItWorksSteps heading="From a problem to a fixed car in four steps." steps={STEPS} />
      <PriceExplainer heading="A written price before any spanner moves." rows={PRICES} />
      <FaqList heading="Garage service with CRAL" items={FAQS} />
      <EarnBand
        heading="Run a garage?"
        body="Get requests from drivers in your county, send your price line by line, and be paid to M-Pesa or your bank after each job."
        cta="Join as a garage"
        joinPath="/join/garages"
      />
    </div>
  );
}

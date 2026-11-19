import { useSeo } from "../../lib/use-seo.js";
import { useIsAuthenticated } from "../../lib/auth.js";
import { getService, type ComingService, type LiveService } from "../../lib/services.js";
import { SubsiteHero } from "../../components/subsite/SubsiteHero.js";
import { HowItWorksSteps, type Step } from "../../components/subsite/HowItWorksSteps.js";
import { PriceExplainer, type PriceRow } from "../../components/subsite/PriceExplainer.js";
import { FaqList, type Faq } from "../../components/subsite/FaqList.js";
import { GarageRequestForm } from "../../components/garage/GarageRequestForm.js";
import { YourGarageRequests } from "../../components/garage/YourGarageRequests.js";

/**
 * `/garage`: ask CRAL-visited garages for an itemised price (Phase 4 GS2).
 * Public, like towing: the form sits in the hero and survives sign-in.
 *
 * Unlisted for now: the registry keeps garage under "Coming to CRAL", so
 * no tab, door or footer link points here until a quote can be accepted
 * and paid (GS3) and the sub-site is finished (GS4). The hero reads the
 * registry's own garage copy.
 *
 * Not from a canvas; built from tokens.ts and docs/plans/ui-services-proposal.md
 * section 4.3. Hero photo is a placeholder (public/images/services/CREDITS.txt).
 */

const STEPS: Step[] = [
  {
    title: "Say what the car needs",
    body: "Pick the car, the kind of work and your county, and describe the problem in your own words.",
  },
  {
    title: "Garages send itemised prices",
    body: "Up to 5 garages CRAL has visited get your request. Each one sends a price line by line: parts, labour and anything else.",
  },
  {
    title: "Compare them side by side",
    body: "See every quote, how long the work takes and when the price runs out. Nothing is charged for asking.",
  },
];

const PRICES: PriceRow[] = [
  { label: "Line by line", body: "Every quote lists each part and each piece of labour with its own price, so you can see what you pay for." },
  { label: "Valid 48 hours", body: "A garage's price stands for 48 hours from when it is sent. If it changes the quote, the 48 hours start again." },
  { label: "Nothing added later", body: "Extra work found on the job comes to you as a second quote. Nothing is added to the bill without your yes." },
];

const FAQS: Faq[] = [
  {
    q: "Which garages see my request?",
    a: "Up to 5 garages in your county that do the work you picked. Each one has been visited by someone from CRAL before it can quote.",
  },
  {
    q: "Who sees my chassis number?",
    a: "Only the garages asked to quote on that request, so they price for your exact car. It is never shown publicly.",
  },
  {
    q: "Does asking cost anything?",
    a: "No. Asking for quotes is free, and you are under no obligation to take any of them.",
  },
  {
    q: "Can I stop the request?",
    a: "Yes. Close it from the request page and garages can no longer quote on it.",
  },
];

/** The registry's garage copy, in the hero's shape. */
function heroService(): LiveService {
  const g = getService("garage") as ComingService;
  return {
    status: "live",
    key: "garage",
    tab: "Garage",
    label: g.label,
    note: "",
    kicker: g.kicker,
    h1: g.title,
    lede: g.sub,
    icon: g.icon,
    photo: "/images/services/garage.jpg",
    href: "/garage",
    match: ["/garage"],
  };
}

export function GarageHome(): JSX.Element {
  useSeo({
    title: "Garage service and repair quotes in Kenya",
    description: "Describe what your car needs and get itemised prices from garages CRAL has visited. Asking is free.",
    path: "/garage",
  });
  const isAuthenticated = useIsAuthenticated();
  return (
    <div>
      <SubsiteHero service={heroService()}>
        <GarageRequestForm />
      </SubsiteHero>
      {isAuthenticated && <YourGarageRequests />}
      <HowItWorksSteps heading="From a problem to a price in three steps." steps={STEPS} />
      <PriceExplainer heading="A written price before any spanner moves." rows={PRICES} />
      <FaqList heading="Garage service with CRAL" items={FAQS} />
    </div>
  );
}

import { useSeo } from "../../lib/use-seo.js";
import { useIsAuthenticated } from "../../lib/auth.js";
import { getService, type LiveService } from "../../lib/services.js";
import { SubsiteHero } from "../../components/subsite/SubsiteHero.js";
import { HowItWorksSteps, type Step } from "../../components/subsite/HowItWorksSteps.js";
import { PriceExplainer, type PriceRow } from "../../components/subsite/PriceExplainer.js";
import { FaqList, type Faq } from "../../components/subsite/FaqList.js";
import { TowRequestForm } from "../../components/towing/TowRequestForm.js";
import { YourTowRequests } from "../../components/towing/YourTowRequests.js";

/**
 * `/towing`: the call-a-tow sub-site (UI3), replacing the signed-in-only
 * `/services/towing` (which now redirects here, forever, for emailed
 * links). Public: the request form sits in the hero and survives sign-in
 * (`components/towing/TowRequestForm.tsx`); a signed-in renter sees their
 * requests below. No supplier band: CRAL dispatches towing itself.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.3 (Towing column).
 *
 * Copy holds to how towing works today (docs/decisions/services.md): lead
 * capture, a person at CRAL quotes each job by hand (a figure, or the price
 * agreed on the call), the renter accepts or not, and nothing is paid
 * through the site. No per-km fare is computed, so none is promised.
 */

const STEPS: Step[] = [
  {
    title: "Tell us where you are",
    body: "Say what happened, where the vehicle is and where it should go. Give a number we can reach you on.",
  },
  {
    title: "CRAL quotes",
    body: "A person at CRAL finds a tow near you and sends the price, or calls you to agree it. Nothing is dispatched until you say yes.",
  },
  {
    title: "Settled on the call",
    body: "Accept the quote here or on the phone. The tow comes to you, and the request stays on your account.",
  },
];

const PRICES: PriceRow[] = [
  {
    label: "Quoted per job",
    body: "Every tow is priced for its own distance, vehicle and situation. CRAL sends the figure before anything moves.",
  },
  {
    label: "On the call",
    body: "When a job is hard to price in writing, the quote says so and the price is agreed with you on the phone.",
  },
  {
    label: "When you pay",
    body: "Requesting a tow costs nothing. You pay only for a quote you have accepted, as agreed on the call.",
  },
];

const FAQS: Faq[] = [
  {
    q: "Do I need an account to request a tow?",
    a: "Yes, to send it, so CRAL can keep the request and the quote in one place. Fill in the form first; it is kept while you sign in or create an account, and sent the moment you are back.",
  },
  {
    q: "How fast will someone call me?",
    a: "A person at CRAL picks up every new request and calls the number you gave. If you are blocking a road or not safe where you are, call CRAL straight away instead.",
  },
  {
    q: "Why is there no fixed price per kilometre?",
    a: "Because a fair price depends on where you are, the vehicle and what happened. CRAL quotes each job rather than show a fare it can't stand behind.",
  },
  {
    q: "Can I say where the vehicle should go?",
    a: "Yes. Name a garage, your home or anywhere else. Leave it blank if you are not sure, and agree it on the call.",
  },
  {
    q: "Can I turn a quote down?",
    a: "Yes. Nothing is dispatched until you accept. If the price doesn't suit you, leave it and nothing is owed.",
  },
];

export function TowingHome(): JSX.Element {
  useSeo({
    title: "Call a tow in Kenya",
    description: "Broken down or in an accident? Tell CRAL where you are. A person quotes the tow and agrees the price with you before anything is dispatched.",
    path: "/towing",
  });
  const service = getService("towing") as LiveService;
  const isAuthenticated = useIsAuthenticated();

  return (
    <div>
      <SubsiteHero service={service}>
        <TowRequestForm />
      </SubsiteHero>
      {isAuthenticated && <YourTowRequests />}
      <HowItWorksSteps heading="From roadside to sorted in three steps." steps={STEPS} />
      <PriceExplainer heading="A price for your job, before the tow moves." rows={PRICES} />
      <FaqList heading="Towing with CRAL" items={FAQS} />
    </div>
  );
}

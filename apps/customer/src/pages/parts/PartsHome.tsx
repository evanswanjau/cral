import { Link } from "react-router-dom";
import { useSeo } from "../../lib/use-seo.js";
import { getService, type LiveService } from "../../lib/services.js";
import { SubsiteHero } from "../../components/subsite/SubsiteHero.js";
import { HowItWorksSteps, type Step } from "../../components/subsite/HowItWorksSteps.js";
import { PriceExplainer, type PriceRow } from "../../components/subsite/PriceExplainer.js";
import { FaqList, type Faq } from "../../components/subsite/FaqList.js";
import { EarnBand } from "../../components/subsite/EarnBand.js";

/**
 * `/parts`: the spare parts sub-site (Phase 5 PT2). PT1 built the request
 * form (`/my-parts`, signed in), the dealer's quote and the paid part
 * order on the garage engine; PT2 made parts a live service in the
 * registry (masthead tab, front-door door, footer link, sitemap) and wrote
 * this landing. It replaces the old redirect to `/#coming`.
 *
 * Public. The hero's card sends the visitor to `/my-parts`, where the
 * request form lives; `RequireAuth` there brings a signed-out visitor
 * back to it after sign-in. The hero reads the registry's parts entry
 * (the canvas `vertDefs` copy).
 *
 * Copy holds to how parts work today (docs/decisions/parts.md): the car
 * must carry its chassis number, up to 5 checked parts dealers in the
 * county get the request, each quote names genuine / OEM / used and fitted
 * or delivered, delivery is the dealer's own and priced on the quote, pay
 * CRAL upfront by M-Pesa, confirm "right part" or it confirms itself 72 h
 * after delivery, a wrong part goes to CRAL support who release or refund.
 * No catalog, no picking one named dealer, no count of dealers: none of
 * that is built, so none of it is promised.
 *
 * Not from a canvas; built from tokens.ts and docs/plans/ui-services-proposal.md
 * section 4.3. Hero photo is an Unsplash placeholder (public/images/services/CREDITS.txt).
 */

const STEPS: Step[] = [
  {
    title: "Name the part and the car",
    body: "Pick the car from My cars, say which part you need and where it should go. The car needs its chassis number from the logbook. Asking is free.",
  },
  {
    title: "Dealers quote against your chassis",
    body: "Up to 5 parts dealers in your county that CRAL has checked get your request. Each one says the condition, the price and how it reaches you.",
  },
  {
    title: "Accept one and pay CRAL",
    body: "Pick the quote that suits you and pay by M-Pesa. CRAL holds the money; the dealer gets the part ready once it has landed.",
  },
  {
    title: "Check it's the right part",
    body: "When it is delivered or fitted, tell CRAL it's the right part. Only then is the dealer paid. Wrong part? Say so and the money stays put.",
  },
];

const PRICES: PriceRow[] = [
  {
    label: "Quoted against your car",
    body: "Dealers see your car's chassis number, not just the make and year, so the price is for the part that fits your exact car.",
  },
  {
    label: "Genuine, OEM or used",
    body: "Genuine is the carmaker's own part. OEM is made to the same specification by another maker. Used is a second-hand part. Every quote says which one you are getting.",
  },
  {
    label: "Delivery on the quote",
    body: "A dealer that delivers adds the delivery as its own priced line. A dealer that fits the part at its premises says so instead. Either way, the total is the total.",
  },
  {
    label: "Paid upfront, held by CRAL",
    body: "You pay the quote you accepted, and not a shilling more. CRAL keeps the money until you confirm it is the right part.",
  },
];

const FAQS: Faq[] = [
  {
    q: "Why do dealers need my chassis number?",
    a: "The same model can carry different parts from one year, engine or market to the next. The chassis number tells a dealer exactly which car it is, so they quote for the part that fits instead of guessing.",
  },
  {
    q: "Which dealers see my request?",
    a: "Up to 5 parts dealers in the county you pick. Before a dealer can quote, CRAL has approved the business and someone from CRAL has visited its premises.",
  },
  {
    q: "Who sees my chassis number and address?",
    a: "Only the dealers asked to quote on that request. Neither is ever shown publicly.",
  },
  {
    q: "What do genuine, OEM and used mean?",
    a: "Genuine is made by or for the carmaker and carries its branding. OEM is made to the carmaker's specification by another company, usually for less. Used is a second-hand part taken from another car. The quote tells you which, before you pay.",
  },
  {
    q: "How does the part reach me?",
    a: "Each quote says either delivered, with the delivery priced as its own line, or fitted at the dealer's premises. CRAL does not send riders: the dealer delivers or fits it.",
  },
  {
    q: "When do I pay, and when is the dealer paid?",
    a: "You pay CRAL by M-Pesa when you accept a quote. CRAL holds the money and pays the dealer only after you confirm it is the right part.",
  },
  {
    q: "What if it's the wrong part?",
    a: "Report it on the order before you confirm. The money stays with CRAL, and CRAL support looks into it and either pays the dealer or refunds you in full.",
  },
  {
    q: "What if I don't confirm?",
    a: "Once the dealer marks the part delivered or fitted, you have 72 hours to confirm it or report a wrong part. If you say nothing, the order confirms itself and the dealer is paid.",
  },
  {
    q: "Can I browse parts and prices?",
    a: "Not yet. There is no catalogue: you ask for the part you need and dealers quote for your car. The part then stays on the car's service record under My cars.",
  },
];

function AskCard(): JSX.Element {
  return (
    <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "18px 18px 16px", boxShadow: "0 12px 32px rgba(11,15,26,.28)" }}>
      <div style={{ font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".11em", color: "#5A6373", marginBottom: 10 }}>
        ASK FOR A PART
      </div>
      <p style={{ margin: "0 0 14px", font: "400 15px/1.55 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
        Name the part, pick your car and your county, and say where it should go. Dealers send their prices to your
        account.
      </p>
      <Link
        to="/my-parts"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 48,
          borderRadius: 8,
          background: "#0F23A8",
          color: "#FFFFFF",
          font: "600 15px/1 'Instrument Sans',sans-serif",
          textDecoration: "none",
        }}
      >
        Ask dealers for a price
      </Link>
      <p style={{ margin: "10px 0 0", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        Free to ask. You'll need an account and your car's chassis number from the logbook.
      </p>
    </div>
  );
}

export function PartsHome(): JSX.Element {
  useSeo({
    title: "Spare parts quoted against your car in Kenya",
    description:
      "Ask for a part and get prices from parts dealers CRAL has checked, quoted against your chassis number: genuine, OEM or used, delivered or fitted. Pay CRAL by M-Pesa.",
    path: "/parts",
  });
  const service = getService("parts") as LiveService;

  return (
    <div>
      <SubsiteHero service={service}>
        <AskCard />
      </SubsiteHero>
      <HowItWorksSteps heading="From the part you need to the part in your hand." steps={STEPS} />
      <PriceExplainer heading="You know what you're buying before you pay." rows={PRICES} />
      <FaqList heading="Spare parts with CRAL" items={FAQS} />
      <EarnBand
        heading="Sell spare parts?"
        body="Get requests from drivers in your county with the chassis number attached, quote the part you have, and be paid to M-Pesa or your bank once the driver confirms it."
        cta="Join as a parts dealer"
        joinPath="/join/parts"
      />
    </div>
  );
}

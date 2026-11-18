import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../../lib/use-seo.js";
import { getService, type LiveService } from "../../lib/services.js";
import { getCollections, type Money } from "../../lib/catalog-api.js";
import { SubsiteHero } from "../../components/subsite/SubsiteHero.js";
import { HowItWorksSteps, type Step } from "../../components/subsite/HowItWorksSteps.js";
import { PriceExplainer, type PriceRow } from "../../components/subsite/PriceExplainer.js";
import { FaqList, type Faq } from "../../components/subsite/FaqList.js";
import { EarnBand } from "../../components/subsite/EarnBand.js";
import { CarSearch } from "../../components/cars/CarSearch.js";
import { CarRail, RailsMessage } from "../../components/cars/CarRail.js";
import { CarTypeTiles } from "../../components/cars/CarTypeTiles.js";

/**
 * `/cars`: the car-hire landing (UI1b). The car search, the collection
 * rails and the car-type tiles moved here from the old home page, which
 * is now the front door. Every search, tile and "See all" goes to
 * `/cars/search?...`.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.3 (Cars column).
 *
 * Copy holds to how the product works today:
 *  - No deposit line. The price explainer was asked to say the deposit
 *    "the way Booking.tsx already explains it", but Booking.tsx never
 *    mentions one, and the recorded rule is that the deposit is never
 *    surfaced to the hirer (Footer.tsx, TripDetail.tsx, owner's call
 *    2026-09-11). Stating it here would invent a promise; flagged in the
 *    UI1b report instead.
 *  - The pickup code goes out by email (TripDetail.tsx); the site only
 *    ever shows its state, never the code.
 */

const STEPS: Step[] = [
  {
    title: "Search your dates",
    body: "Pick a county and the days you need. You only see cars that are free on those dates.",
  },
  {
    title: "Send a request",
    body: "Choose a car, add a driver if you want one, and send. Sending a request is free.",
  },
  {
    title: "The owner accepts, you pay",
    body: "The owner has twelve hours to say yes. Once they do, an M-Pesa prompt comes to your phone and the booking is confirmed when you pay.",
  },
  {
    title: "Pick up with your code",
    body: "Before pickup CRAL emails you a handover code. Give it to the owner when you collect the car, and the hire starts.",
  },
];

const PRICES: PriceRow[] = [
  {
    label: "Per day",
    body: "Each car shows its daily rate. The total for your dates is worked out before you send the request, and it does not change once the owner accepts.",
  },
  {
    label: "Minimum hire",
    body: "Some owners hire a car for a few days at a time. The car's page says so, and the dates won't let you book less.",
  },
  {
    label: "With a driver",
    body: "Add a CRAL-checked driver at booking. Their rate is added to the total, so you see one price for the car and the driver.",
  },
  {
    label: "When you pay",
    body: "Nothing is charged for a request. You pay by M-Pesa only after the owner accepts, and CRAL adds no booking fee on top.",
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
    q: "How do I pay?",
    a: "By M-Pesa. Once the owner accepts, an M-Pesa prompt comes to your phone. Enter your PIN and the booking is confirmed.",
  },
  {
    q: "Can the price change after the owner accepts?",
    a: "No. The total you see before you send the request is the total you pay.",
  },
  {
    q: "Can I hire a car with a driver?",
    a: "Yes. When you book, add one of the drivers CRAL has checked. Their rate is added to the same booking.",
  },
  {
    q: "What does CRAL check before a car is listed?",
    a: "A person reads the car's logbook, insurance and the owner's ID before it appears here. When the insurance lapses, the car comes off the site until it is renewed.",
  },
];

/** The lowest daily rate per category among the cars already loaded for the rails. */
function minPrices(collections: Array<{ vehicles: Array<{ id: string; category: string; daily_rate: Money }> }>): Map<string, Money> {
  const unique = new Map(collections.flatMap((c) => c.vehicles).map((v) => [v.id, v]));
  const out = new Map<string, Money>();
  for (const v of unique.values()) {
    const cur = out.get(v.category);
    if (!cur || v.daily_rate.amount < cur.amount) out.set(v.category, v.daily_rate);
  }
  return out;
}

export function CarsHome(): JSX.Element {
  useSeo({
    title: "Hire a car in Kenya",
    description:
      "Self-drive or with a driver, from owners CRAL has checked. Sending a request is free, and you pay by M-Pesa only once the owner accepts your dates.",
    path: "/cars",
  });
  const service = getService("cars") as LiveService;
  const { data, isLoading, isError } = useQuery({ queryKey: ["catalog", "collections"], queryFn: getCollections });
  const rails = (data?.collections ?? []).filter((c) => c.vehicles.length > 0);

  return (
    <div>
      <SubsiteHero service={service}>
        <CarSearch />
      </SubsiteHero>

      <div style={{ paddingTop: "clamp(16px,2.6vw,28px)" }}>
        {isLoading && <RailsMessage>Loading cars…</RailsMessage>}
        {isError && <RailsMessage>We couldn't load the listings just now. Refresh in a moment.</RailsMessage>}
        {!isLoading && !isError && rails.length === 0 && (
          <RailsMessage>No cars are listed right now. Check back soon.</RailsMessage>
        )}
        {rails.map((c) => (
          <CarRail key={c.key} collection={c} />
        ))}
      </div>

      <CarTypeTiles minPriceByCategory={minPrices(rails)} />
      <HowItWorksSteps heading="From search to keys in four steps." steps={STEPS} />
      <PriceExplainer heading="You see the total before you send." rows={PRICES} />
      <FaqList heading="Hiring a car on CRAL" items={FAQS} />
      <EarnBand
        heading="Have a car you are not using every day?"
        body="List it on CRAL. A person checks the papers, you set the rate and the dates, and you are paid after each hire."
        cta="List your car"
        joinPath="/join/cars"
      />
    </div>
  );
}

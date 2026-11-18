import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { getService, type LiveService } from "../lib/services.js";
import { listDrivers } from "../lib/drivers-api.js";
import { SubsiteHero } from "../components/subsite/SubsiteHero.js";
import { HowItWorksSteps, type Step } from "../components/subsite/HowItWorksSteps.js";
import { PriceExplainer, type PriceRow } from "../components/subsite/PriceExplainer.js";
import { FaqList, type Faq } from "../components/subsite/FaqList.js";
import { EarnBand } from "../components/subsite/EarnBand.js";
import { DriverCountyPicker } from "../components/drivers/DriverCountyPicker.js";
import { DriverList } from "../components/drivers/DriverList.js";

/**
 * `/drivers`: the hire-a-driver sub-site landing (UI3). A checked driver
 * for your own car (owner's call, 2026-10-18 - docs/plans/drivers.md).
 * Public: the list and each driver's page at `/drivers/:id` open without
 * an account; only sending a request asks for one.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.3 (Drivers column).
 *
 * Copy holds to how driver hire works today (docs/decisions/drivers.md,
 * bookings-payouts.md): per day, per hour or per trip, whichever the
 * driver offers; the owner they drive for has twelve hours to accept;
 * M-Pesa once they do; the hirer's own insurance has to cover another
 * driver. Only the public projection of a driver is ever shown. The
 * supplier band points at the merchant site's `/join/drivers` (UI4).
 */

const STEPS: Step[] = [
  {
    title: "Pick a driver",
    body: "Choose a county and open a driver to see their rates. Each one drives for an owner CRAL has checked.",
  },
  {
    title: "Say when, and what car",
    body: "Pick the days, or the hours or trip, and tell the driver what car they will be driving. Sending a request is free.",
  },
  {
    title: "The owner accepts, you pay",
    body: "The owner the driver works for has twelve hours to say yes. Once they do, an M-Pesa prompt comes to your phone.",
  },
  {
    title: "The driver arrives",
    body: "Your booking holds the dates, the times and the price. The driver comes to you and drives your car.",
  },
];

const PRICES: PriceRow[] = [
  {
    label: "Per day",
    body: "The daily rate times the days you need the driver, from 09:00 on the first day to 17:00 on the last.",
  },
  {
    label: "Per hour",
    body: "The hourly rate times the hours between the start and end you pick, rounded up to the next hour.",
  },
  {
    label: "Per trip",
    body: "One price for a single trip on one day, whatever the time it takes. Only some drivers offer it.",
  },
  {
    label: "When you pay",
    body: "Nothing is charged for a request. You pay by M-Pesa only after the owner accepts, and the total does not change once they do.",
  },
];

const FAQS: Faq[] = [
  {
    q: "Do I need an account to look at drivers?",
    a: "No. You can see every driver and their rates without signing in. You sign in only to send a request.",
  },
  {
    q: "What does CRAL check before a driver appears here?",
    a: "A person at CRAL reads the driver's licence and ID, and the driver works for an owner CRAL has approved. Their documents stay private: you see their name, county and rates.",
  },
  {
    q: "Whose car does the driver drive?",
    a: "Yours. Tell them the make, colour and number plate when you send the request. Your own insurance needs to cover another driver.",
  },
  {
    q: "What do I need before I can send a request?",
    a: "A CRAL account with your phone number confirmed by SMS and a photo of your ID on file. The request page walks you through both.",
  },
  {
    q: "Can I hire a car and a driver together?",
    a: "Yes. Many cars on CRAL come with a driver, or let you add one. Pick the car first, and the car's page shows the drivers you can add.",
  },
];

export function Drivers(): JSX.Element {
  useSeo({
    title: "Hire a driver in Kenya",
    description: "A checked driver for your own car, by the day, the hour or the trip. Pay by M-Pesa once the owner accepts.",
    path: "/drivers",
  });
  const service = getService("drivers") as LiveService;
  const [params, setParams] = useSearchParams();
  const county = params.get("county") ?? "";
  const { data, isLoading, error } = useQuery({ queryKey: ["catalog", "drivers"], queryFn: () => listDrivers() });

  const all = data?.data ?? [];
  const counties = [...new Set(all.map((d) => d.county))].sort();
  const shown = all.filter((d) => !county || d.county === county);

  const pickCounty = (c: string) => setParams(c ? { county: c } : {}, { replace: true });

  return (
    <div>
      <SubsiteHero service={service}>
        <DriverCountyPicker counties={counties} county={county} onChange={pickCounty} total={data ? shown.length : null} />
      </SubsiteHero>
      <DriverList drivers={shown} isLoading={isLoading} failed={!!error} county={county} />
      <HowItWorksSteps heading="A driver for your car in four steps." steps={STEPS} />
      <PriceExplainer heading="You see the total before you send." rows={PRICES} />
      <FaqList heading="Hiring a driver on CRAL" items={FAQS} />
      <EarnBand
        heading="Drive for a living?"
        body="Join CRAL with your licence and ID, or add the drivers you already employ. You set the rates, and you are paid after each booking."
        cta="Drive with CRAL"
        joinPath="/join/drivers"
      />
    </div>
  );
}

/**
 * The four kinds of supplier the merchant site speaks to, and everything
 * the "Earn with CRAL" landing (`/`) and the supplier pages
 * (`/join/:type`) say about each. One record per type, so a page never
 * hard-codes "vehicle" for someone who only drives.
 *
 * Copy rules (merchant surface): no em dashes, never CRAL's fee rate (the
 * estimator shows take-home "after CRAL's service fee" only), never the
 * hirer's deposit. Units mirror what the API prices today
 * (`docs/decisions/trucks.md`, `drivers.md`): cars per day; trucks per
 * trip, day, km or tonne (km and tonne are quoted first); machinery per
 * day or trip; drivers per day, hour or trip.
 *
 * `?offer=<type>` on `/create-account` is kept in sessionStorage
 * (`rememberOffer`) so onboarding (UI5) can pre-select it. Nothing is
 * stored server-side.
 */

export const SUPPLIER_TYPES = ["cars", "trucks", "machinery", "drivers"] as const;
export type SupplierType = (typeof SUPPLIER_TYPES)[number];

export function isSupplierType(value: string | null | undefined): value is SupplierType {
  return !!value && (SUPPLIER_TYPES as readonly string[]).includes(value);
}

export type EstimatorUnit = {
  /** Unit word as it reads after "per": day, trip, km, tonne, hour. */
  unit: "day" | "trip" | "km" | "tonne" | "hour";
  /** Example rate in whole shillings, prefilled and editable. */
  exampleRate: number;
  /** The "how many a month" slider. */
  qtyLabel: string;
  qtyMin: number;
  qtyMax: number;
  qtyStep: number;
  qtyDefault: number;
  /** Plural of the unit for the "over N ..." line. */
  plural: string;
  /** Shown under the figure when this unit is priced by quote. */
  note?: string;
};

export type SupplierStep = { title: string; body: string };
export type SupplierFaq = { q: string; a: string };

export type SupplierInfo = {
  type: SupplierType;
  /** Door label on `/`. */
  label: string;
  /** One line under the door label. */
  doorLine: string;
  /** Kicker over the supplier page headline. */
  kicker: string;
  headline: string;
  lede: string;
  /** File in `public/images/landing/`, without extension. */
  photo: string;
  /** Door photo on `/` (portrait crop). */
  doorPhoto: string;
  /** Hero CTA and final CTA label. */
  cta: string;
  /** What the estimator calls the thing that earns. */
  estimatorSubject: string;
  /** At least one; the first is the default. */
  units: [EstimatorUnit, ...EstimatorUnit[]];
  docsIntro: string;
  docs: string[];
  docsFoot: string;
  requestsHeading: string;
  requests: SupplierStep[];
  faq: SupplierFaq[];
  finalHeading: string;
  pageTitle: string;
};

const DAYS: Omit<EstimatorUnit, "exampleRate"> = {
  unit: "day",
  qtyLabel: "HIRE DAYS A MONTH",
  qtyMin: 1,
  qtyMax: 30,
  qtyStep: 1,
  qtyDefault: 12,
  plural: "days",
};

const TRIPS = (qtyDefault: number, qtyMax: number): Omit<EstimatorUnit, "exampleRate"> => ({
  unit: "trip",
  qtyLabel: "TRIPS A MONTH",
  qtyMin: 1,
  qtyMax,
  qtyStep: 1,
  qtyDefault,
  plural: "trips",
});

const QUOTE_NOTE = "Priced per km or per tonne, every request is quoted by you first. The rate here is your guide.";

const COMPANY_FOOT =
  "Signing up as a company? You'll also need a certificate of incorporation, the company's KRA PIN and a CR12.";

const VEHICLE_DOCS = [
  "Logbook for each vehicle",
  "Comprehensive insurance, current (not third-party only)",
  "Tracker certificate",
  "Your national ID",
  "Your KRA PIN",
];

export const COST_FAQ: SupplierFaq = {
  q: "What does it cost to join?",
  a: "Nothing. There's no sign-up or listing fee, and nothing is charged while you're not working. CRAL takes a service fee from each completed job, and the exact fee is set out in the merchant terms you accept when you sign up.",
};

export const PAY_FAQ: SupplierFaq = {
  q: "How and when do I get paid?",
  a: "To M-Pesa or a bank account. M-Pesa payouts run every Monday or monthly on the 1st, whichever you pick. Bank payouts run monthly on the 1st. Every payout comes with a receipt and a statement.",
};

export const REVIEW_FAQ: SupplierFaq = {
  q: "How long does the review take?",
  a: "Usually within two working days of sending your documents. We tell you the moment you're live, or exactly what needs fixing if something is missing.",
};

export const SUPPLIERS: Record<SupplierType, SupplierInfo> = {
  cars: {
    type: "cars",
    label: "Cars and vans",
    doorLine: "Sedans, SUVs, vans and minibuses, self-drive or with a driver",
    kicker: "FOR CAR AND VAN OWNERS",
    headline: "Your car earns on the days you're not using it.",
    lede: "List it on CRAL, set your daily rate and accept the hires that suit you. A real person checks every listing, and your earnings are paid to M-Pesa or your bank.",
    photo: "join-cars",
    doorPhoto: "cat-suv",
    cta: "List your car",
    estimatorSubject: "car",
    units: [{ ...DAYS, exampleRate: 6000 }],
    docsIntro:
      "Your listing is reviewed faster when these are to hand. Photos from your phone are fine. You can start without one, but the car won't go live until the set is complete.",
    docs: VEHICLE_DOCS,
    docsFoot: COMPANY_FOOT,
    requestsHeading: "How a hire works.",
    requests: [
      { title: "A hirer sends a request", body: "You see the dates, the pickup place and what you'll take home before you say yes." },
      { title: "You accept or decline", body: "Only the hires that suit you. Once you accept, the hirer pays CRAL by M-Pesa." },
      { title: "Check the code at pickup", body: "The hirer reads you a one-time code, so the keys only go to the person who booked." },
      { title: "Get paid after the hire", body: "Your take-home joins your next payout run, to M-Pesa or your bank." },
    ],
    faq: [
      COST_FAQ,
      REVIEW_FAQ,
      PAY_FAQ,
      {
        q: "Can I offer my car with a driver?",
        a: "Yes. Each car can be self-drive or chauffeured, and you can switch it from the car's settings at any time. You can add yourself or your own drivers.",
      },
      {
        q: "Do I need to be a registered company?",
        a: "No. Individuals and companies can both list. One car or a whole fleet is fine.",
      },
      {
        q: "What if the car comes back damaged?",
        a: "Walk round the car with the hirer at pickup and take your own photos. If something's wrong on return, email support@cral.co.ke and CRAL follows it up.",
      },
    ],
    finalHeading: "Ready to put your car to work?",
    pageTitle: "Earn with your car",
  },
  trucks: {
    type: "trucks",
    label: "Trucks and fleets",
    doorLine: "Tippers, flatbeds, box bodies and trailers, one truck or a fleet",
    kicker: "FOR TRUCK OWNERS AND FLEETS",
    headline: "Keep your trucks moving between your own jobs.",
    lede: "List them on CRAL and say how you charge: per trip, per day, per km or per tonne. You see the route and the load before you agree a price, and you're paid to M-Pesa or your bank.",
    photo: "join-trucks",
    doorPhoto: "cat-truck",
    cta: "List your truck",
    estimatorSubject: "truck",
    units: [
      { ...TRIPS(10, 40), exampleRate: 25000 },
      { ...DAYS, exampleRate: 18000, qtyDefault: 10 },
      {
        unit: "km",
        exampleRate: 150,
        qtyLabel: "KM A MONTH",
        qtyMin: 100,
        qtyMax: 10000,
        qtyStep: 100,
        qtyDefault: 2000,
        plural: "km",
        note: QUOTE_NOTE,
      },
      {
        unit: "tonne",
        exampleRate: 2500,
        qtyLabel: "TONNES A MONTH",
        qtyMin: 5,
        qtyMax: 500,
        qtyStep: 5,
        qtyDefault: 100,
        plural: "tonnes",
        note: QUOTE_NOTE,
      },
    ],
    docsIntro:
      "Each truck is reviewed faster when these are to hand. Photos from your phone are fine. You'll also give each truck's type and how much it carries.",
    docs: VEHICLE_DOCS,
    docsFoot: COMPANY_FOOT,
    requestsHeading: "How a truck job works.",
    requests: [
      { title: "A request names the route and load", body: "From where to where, the county at each end, what's being carried and how heavy it is." },
      { title: "You price it or accept it", body: "Per km and per tonne jobs, or any truck you set to quote first, wait for your price. You have 12 hours to send it." },
      { title: "The hirer accepts and pays", body: "Your quote stands for 48 hours. Once accepted, the hirer pays CRAL by M-Pesa before the job." },
      { title: "Do the job, get paid", body: "Your take-home joins your next payout run, to M-Pesa or your bank." },
    ],
    faq: [
      COST_FAQ,
      {
        q: "Can I charge per km or per tonne?",
        a: "Yes. Pick per km or per tonne on the truck and set your guide rate, plus a minimum charge if you want one. Every request on those rates comes to you to price before the hirer pays.",
      },
      {
        q: "Can I always price a job myself?",
        a: "Yes. Switch on \"Always quote me first\" on any truck and every request waits for your price, whatever the rate.",
      },
      REVIEW_FAQ,
      PAY_FAQ,
      {
        q: "Can I list a whole fleet?",
        a: "Yes. Add each truck from your portal. Each one is reviewed on its own papers, and you manage all of them, their bookings and payouts in one place.",
      },
    ],
    finalHeading: "Ready to fill the empty days?",
    pageTitle: "Earn with your trucks",
  },
  machinery: {
    type: "machinery",
    label: "Machinery",
    doorLine: "Excavators, loaders, rollers and other plant for site and farm work",
    kicker: "FOR PLANT AND MACHINERY OWNERS",
    headline: "Hire out your machines between your own sites.",
    lede: "List your excavators, loaders and rollers on CRAL, charge per day or per trip, and accept the jobs that fit. A real person checks every listing, and you're paid to M-Pesa or your bank.",
    photo: "join-machinery",
    doorPhoto: "cat-machinery",
    cta: "List your machine",
    estimatorSubject: "machine",
    units: [
      { ...DAYS, exampleRate: 25000, qtyDefault: 10 },
      { ...TRIPS(6, 30), exampleRate: 35000 },
    ],
    docsIntro:
      "Each machine is reviewed faster when these are to hand. Photos from your phone are fine. You can start without one, but the machine won't go live until the set is complete.",
    docs: [
      "Logbook or proof of ownership for each machine",
      "Comprehensive insurance, current",
      "Tracker certificate",
      "Your national ID",
      "Your KRA PIN",
    ],
    docsFoot: COMPANY_FOOT,
    requestsHeading: "How a machinery hire works.",
    requests: [
      { title: "A hirer sends a request", body: "You see the dates, the site and what you'll take home before you say yes." },
      { title: "You accept or decline", body: "Only the jobs that fit your own work. Once you accept, the hirer pays CRAL by M-Pesa." },
      { title: "Check the code at handover", body: "The hirer reads you a one-time code, so the machine only goes to the person who booked." },
      { title: "Get paid after the hire", body: "Your take-home joins your next payout run, to M-Pesa or your bank." },
    ],
    faq: [
      COST_FAQ,
      {
        q: "Can I send an operator with the machine?",
        a: "Yes. Add your operators as drivers in your portal, with their licence, ID and KRA PIN, and hirers can book them with the machine.",
      },
      REVIEW_FAQ,
      PAY_FAQ,
      {
        q: "Do I need to be a registered company?",
        a: "No. Individuals and companies can both list. One machine or a whole yard is fine.",
      },
    ],
    finalHeading: "Ready to put your machines to work?",
    pageTitle: "Earn with your machinery",
  },
  drivers: {
    type: "drivers",
    label: "Driving",
    doorLine: "Drive for hirers yourself, or put your drivers on CRAL",
    kicker: "FOR DRIVERS AND DRIVER TEAMS",
    headline: "Get paid to drive, on the days you choose.",
    lede: "Hirers book a driver for their own car, or with a car on CRAL. Set your rate per day, per hour or per trip, accept the jobs that suit you, and get paid to M-Pesa or your bank. You don't need a car.",
    photo: "join-drivers",
    doorPhoto: "join-drivers",
    cta: "Sign up to drive",
    estimatorSubject: "driver",
    units: [
      { ...DAYS, exampleRate: 3000, qtyDefault: 15, qtyLabel: "DAYS DRIVING A MONTH" },
      {
        unit: "hour",
        exampleRate: 500,
        qtyLabel: "HOURS A MONTH",
        qtyMin: 1,
        qtyMax: 200,
        qtyStep: 1,
        qtyDefault: 60,
        plural: "hours",
      },
      { ...TRIPS(12, 60), exampleRate: 2000 },
    ],
    docsIntro:
      "Each driver is reviewed faster when these are to hand. Photos from your phone are fine. If you drive yourself, your own ID and KRA PIN count for you as the driver too.",
    docs: ["Driving licence, current", "National ID", "KRA PIN"],
    docsFoot:
      "Putting other drivers on CRAL? Each one needs their own licence, ID and KRA PIN. Signing up as a company also needs a certificate of incorporation, the company's KRA PIN and a CR12.",
    requestsHeading: "How a driving job works.",
    requests: [
      { title: "A hirer books a driver", body: "For their own car, or together with a car on CRAL. You see the dates and what you'll take home." },
      { title: "You accept or decline", body: "Only the jobs that suit you. Once you accept, the hirer pays CRAL by M-Pesa." },
      { title: "Drive the job", body: "Hirers see the driver's name, never the ID, KRA PIN, licence number or phone." },
      { title: "Get paid after the job", body: "Your take-home joins your next payout run, to M-Pesa or your bank." },
    ],
    faq: [
      COST_FAQ,
      {
        q: "Do I need a car?",
        a: "No. You can sign up only to drive. Hirers book you for their own car, or with a car another owner lists.",
      },
      {
        q: "Can I put my drivers on CRAL?",
        a: "Yes. Add each driver in your portal with their licence, ID and KRA PIN. You're paid for their jobs and pay them yourself.",
      },
      REVIEW_FAQ,
      PAY_FAQ,
      {
        q: "What if my licence is about to expire?",
        a: "We remind you 30 days before. A driver with a lapsed licence can't be booked until a current one is uploaded.",
      },
    ],
    finalHeading: "Ready to start driving with CRAL?",
    pageTitle: "Earn as a driver",
  },
};

/** The unit at `index`, falling back to the type's first unit. */
export function unitAt(supplier: SupplierInfo, index: number): EstimatorUnit {
  return supplier.units[index] ?? supplier.units[0];
}

/**
 * Suppliers CRAL will take on later; shown on `/`, not selectable.
 * Garages left this list in GS4: they join through `/join/garages`
 * (`pages/join/GarageJoinPage.tsx`), not a `SupplierType`, because a garage
 * has no vehicle, no per-day rate and no estimator.
 */
export const COMING_SUPPLIERS = ["Parts dealers", "Car sellers"] as const;

/** What `?offer=` may pre-select in onboarding: a supplier type, or garage services. */
export type RememberedOffer = SupplierType | "garage";

function isRememberedOffer(value: string | null | undefined): value is RememberedOffer {
  return value === "garage" || isSupplierType(value);
}

const OFFER_KEY = "cral.merchant.offer";

/** Keep the `?offer=` a visitor arrived with, for onboarding to pre-select. */
export function rememberOffer(value: string | null): void {
  if (!isRememberedOffer(value)) return;
  try {
    sessionStorage.setItem(OFFER_KEY, value);
  } catch {
    // Private mode or storage blocked: onboarding just starts unselected.
  }
}

/** The offer remembered from `?offer=`, if any. */
export function readRememberedOffer(): RememberedOffer | null {
  try {
    const value = sessionStorage.getItem(OFFER_KEY);
    return isRememberedOffer(value) ? value : null;
  } catch {
    return null;
  }
}

import { Section, bodyText } from "../subsite/Section.js";
import { FaqList, type Faq } from "../subsite/FaqList.js";
import type { HireType } from "./hire-params.js";

/**
 * The few lines kept for search engines, below the results on `/hire`
 * (owner's call, 2026-11-26: "I don't want to read content, I immediately
 * want to hire"). A short paragraph and three questions per type, with
 * FAQPage JSON-LD from `FaqList`. Every line holds to how hire works today:
 * a request is free, the owner has twelve hours, a truck quote holds for
 * 48 hours, payment is by M-Pesa after a yes.
 *
 * Not from a canvas; built from tokens.ts. The copy is cut down from the
 * reading pages H4 removed (`CarsHome`, `TrucksHome`, `MachineryHome`).
 */

const FREE: Faq = {
  q: "Do I pay anything to send a request?",
  a: "No. Sending a request is free. You pay by M-Pesa only once the owner says yes.",
};
const CHECKED: Faq = {
  q: "What does CRAL check before a listing goes up?",
  a: "A person reads the vehicle's papers, its insurance and the owner's ID. When the insurance lapses, the listing comes off the site until it is renewed.",
};

const COPY: Record<HireType, { heading: string; body: string; faqs: Faq[] }> = {
  all: {
    heading: "Hire a car, a truck or machinery in Kenya",
    body: "Cars for self-drive or with a driver, trucks for a load from one county to another, and machinery for site work, all from owners CRAL has checked. You see the price, or get a quote, before you pay, and the price does not change once agreed.",
    faqs: [
      FREE,
      {
        q: "How long does the owner have to reply?",
        a: "Twelve hours. If they don't say yes in that time, the request lapses and you have paid nothing.",
      },
      CHECKED,
    ],
  },
  cars: {
    heading: "Hire a car in Kenya",
    body: "Self-drive or with a driver. Pick a county and your dates and you only see cars that are free on them. The total for your dates is worked out before you send the request, and it does not change once the owner accepts.",
    faqs: [
      FREE,
      {
        q: "Can I hire a car with a driver?",
        a: "Yes. Pick a car that comes with a driver, or add one of the drivers CRAL has checked when you book. Their rate is added to the same booking.",
      },
      CHECKED,
    ],
  },
  trucks: {
    heading: "Hire a truck in Kenya",
    body: "Tippers, flatbeds, box bodies and more. Say where the load starts, where it goes and what it is. A truck priced per day or per trip shows its total before you send; for the rest the owner sends a price, and you pay nothing until you accept it.",
    faqs: [
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
    ],
  },
  machinery: {
    heading: "Hire machinery in Kenya",
    body: "Excavators, loaders, graders and more for site work, by the day. Pick a county and your dates to see what is free. You see the total before you send the request, and it does not change once the owner accepts.",
    faqs: [
      FREE,
      {
        q: "Does an operator come with the machine?",
        a: "Where the listing says so. Otherwise bring your own operator, or ask the owner in the note on your request.",
      },
      CHECKED,
    ],
  },
};

export function HireAbout({ type }: { type: HireType }): JSX.Element {
  const { heading, body, faqs } = COPY[type];
  return (
    <div style={{ borderTop: "1px solid #E4E7EC", background: "#F8F9FB" }}>
      <Section overline="ABOUT HIRING ON CRAL" heading={heading} style={{ paddingBottom: 0 }}>
        <p style={{ ...bodyText, maxWidth: 720 }}>{body}</p>
      </Section>
      <FaqList heading="Questions" items={faqs} />
    </div>
  );
}

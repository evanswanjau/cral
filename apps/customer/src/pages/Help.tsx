import { useState } from "react";
import { Link } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section } from "../components/site/marketing.js";

/** Questions across every live service (UI7). Facts only from how the
 * product works today; see HowItWorks.tsx's header for the sources. */
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Does sending a request cost anything?",
    a: "No. Requesting a car, a truck, machinery, a driver or a tow is free. You pay only once the price is agreed and you accept it.",
  },
  {
    q: "How do I pay?",
    a: "By M-Pesa, through CRAL. Once the owner accepts, or you accept a quote, a prompt comes to your phone. The owner is paid by CRAL after the job.",
  },
  {
    q: "What do I need before I can send a request?",
    a: "A CRAL account with your phone confirmed by SMS and your ID on file. To drive a car or machine yourself, add your driving licence too. The request page walks you through it.",
  },
  {
    q: "How long does the owner have to answer?",
    a: "Twelve hours. If they decline or don't answer in time, the request lapses and you have paid nothing.",
  },
  {
    q: "Why does a truck sometimes need a quote?",
    a: "A truck priced per km or per tonne, or whose owner prices each job, sends you a price instead of showing one up front. The quote holds for 48 hours, and nothing is charged until you accept it.",
  },
  {
    q: "Can I request more than one option for the same dates?",
    a: "Yes. Nothing is charged until an owner accepts, so you can send a few requests and pay only for the one you go ahead with.",
  },
  {
    q: "What does \"checked by CRAL\" mean?",
    a: "That a person at CRAL has read the vehicle's logbook and insurance and the owner's ID and KRA PIN, or a driver's licence and ID. It is not a mechanical inspection - look the vehicle over yourself at handover.",
  },
  {
    q: "How do I offer my car, truck, machinery or driving on CRAL?",
    a: "Listing is free. Choose \"Earn with CRAL\" from the menu to start in the merchant app. A person reviews your papers before you go live.",
  },
];

export function Help(): JSX.Element {
  useSeo({
    title: "Questions and answers",
    description: "Answers to the questions people ask before they first hire a car, truck, machinery or driver, get a car fixed, or call a tow, on CRAL.",
    path: "/help",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  });

  const [open, setOpen] = useState<number | null>(0);

  return (
    <div>
      <PageHero kicker="HELP" title="Questions and answers" />
      <Section>
        <div style={{ display: "grid", gap: 1, background: "#E4E7EC", border: "1px solid #E4E7EC", borderRadius: 12, overflow: "hidden" }}>
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} style={{ background: "#FFFFFF" }}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "16px 18px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span style={{ font: "600 15px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>{f.q}</span>
                  <span style={{ font: "400 18px/1 'Instrument Sans',sans-serif", color: "#838C9B", flex: "none" }}>
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && (
                  <p style={{ margin: 0, padding: "0 18px 16px", font: "400 14px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                    {f.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Section>
      <Section tint>
        <p style={{ margin: 0, font: "400 14.5px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
          Didn't find it?{" "}
          <Link to="/contact" style={{ color: "#0F23A8" }}>
            Contact us
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}

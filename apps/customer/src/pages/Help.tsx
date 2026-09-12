import { useState } from "react";
import { Link } from "react-router-dom";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section } from "../components/site/marketing.js";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Does CRAL charge a booking fee?",
    a: "No. You pay the owner's rate directly - CRAL never adds anything on top of it.",
  },
  {
    q: "Do I need to upload documents before I can request a car?",
    a: "Yes - your national ID and driving licence, once. Upload them from your documents page before sending your first request; every request after that goes out with them already attached.",
  },
  {
    q: "How long does the owner have to answer my request?",
    a: "Twelve hours. If they decline or don't answer in time, the request lapses automatically and you haven't paid anything.",
  },
  {
    q: "Can I request more than one car for the same dates?",
    a: "Yes. Since nothing is charged until an owner accepts, you can send requests for a few options and only ever pay for the one you confirm.",
  },
  {
    q: "Who holds the deposit?",
    a: "Nobody, right now - there's no payment collected through CRAL yet. Any deposit is agreed directly with the owner and settled when you collect the car.",
  },
  {
    q: "What does \"verified\" mean on a listing?",
    a: "That a person at CRAL has read the car's logbook, insurance and tracker certificate and they check out. It is not a mechanical inspection - look the car over yourself before you sign anything.",
  },
  {
    q: "I have a car. How do I list it?",
    a: "Listing is free. Start from the list-your-car page - review usually takes about a working day.",
  },
];

export function Help(): JSX.Element {
  useSeo({
    title: "Questions and answers",
    description: "Answers to the questions people actually ask before their first hire on Cruz Ride Auto.",
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

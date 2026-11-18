import { useEffect } from "react";
import { Section, bodyText } from "./Section.js";

/**
 * A sub-site's questions, as native <details> rows (keyboard and screen
 * reader friendly without any script), plus FAQPage JSON-LD for search.
 *
 * The JSON-LD goes in as a <script type="application/ld+json"> in <head>,
 * the same mechanism `lib/use-seo.ts` uses (Help.tsx passes FAQPage that
 * way). This component appends its own tag rather than calling `useSeo`,
 * because `useSeo` also owns the page title and the page calls it once.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.3.
 */
export interface Faq {
  q: string;
  a: string;
}

export function faqPageJsonLd(items: Faq[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function FaqList({
  overline = "QUESTIONS",
  heading,
  items,
}: {
  overline?: string;
  heading?: string;
  items: Faq[];
}): JSX.Element {
  const json = JSON.stringify(faqPageJsonLd(items));
  useEffect(() => {
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.textContent = json;
    document.head.appendChild(el);
    return () => el.remove();
  }, [json]);

  return (
    <Section overline={overline} heading={heading}>
      <div style={{ background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: 12, overflow: "hidden" }}>
        {items.map((f, i) => (
          <details key={f.q} style={{ borderTop: i === 0 ? "none" : "1px solid #F1F3F6" }}>
            <summary
              style={{
                display: "flex",
                alignItems: "center",
                minHeight: 52,
                padding: "12px 18px",
                cursor: "pointer",
                font: "600 15px/1.4 'Instrument Sans',sans-serif",
                color: "#0B0F1A",
              }}
            >
              {f.q}
            </summary>
            <p style={{ ...bodyText, padding: "0 18px 16px" }}>{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

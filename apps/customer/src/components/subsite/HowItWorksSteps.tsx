import { Section, bodyText, itemTitle } from "./Section.js";

/**
 * Numbered how-it-works steps for a sub-site (3 or 4, proposal 4.3).
 * Content comes from the page. Stacked at 375px, columns on desktop.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.3.
 */
export interface Step {
  title: string;
  body: string;
}

export function HowItWorksSteps({
  id,
  overline = "HOW IT WORKS",
  heading,
  steps,
}: {
  id?: string;
  overline?: string;
  heading?: string;
  steps: Step[];
}): JSX.Element {
  return (
    <Section id={id} overline={overline} heading={heading}>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "clamp(16px,2.4vw,24px)",
        }}
      >
        {steps.map((s, i) => (
          <li
            key={s.title}
            style={{ background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: 12, padding: "18px 18px 20px" }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                marginBottom: 12,
                borderRadius: 999,
                background: "#EDEFFC",
                font: "600 13px/1 'IBM Plex Mono',monospace",
                color: "#0F23A8",
              }}
            >
              {i + 1}
            </div>
            <div style={itemTitle}>{s.title}</div>
            <p style={bodyText}>{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

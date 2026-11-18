import { Section, bodyText } from "./Section.js";

/**
 * "What it costs": how the price a customer pays is worked out, one row
 * per pricing unit (per day, per trip, per km, quoted...). It explains the
 * customer's price only, never CRAL's cut (proposal 4.3). Content comes
 * from the page.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.3 and 5.3.
 */
export interface PriceRow {
  label: string;
  body: string;
}

export function PriceExplainer({
  overline = "WHAT IT COSTS",
  heading,
  rows,
  note,
}: {
  overline?: string;
  heading?: string;
  rows: PriceRow[];
  note?: string;
}): JSX.Element {
  return (
    <Section overline={overline} heading={heading}>
      <dl
        style={{
          margin: 0,
          background: "#FFFFFF",
          border: "1px solid #E4E7EC",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {rows.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px 18px",
              padding: "14px 18px",
              borderTop: i === 0 ? "none" : "1px solid #F1F3F6",
            }}
          >
            <dt style={{ flex: "0 0 120px", font: "600 14px/1.5 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
              {r.label}
            </dt>
            <dd style={{ ...bodyText, flex: "1 1 240px" }}>{r.body}</dd>
          </div>
        ))}
      </dl>
      {note && <p style={{ ...bodyText, marginTop: 12, fontSize: 13 }}>{note}</p>}
    </Section>
  );
}

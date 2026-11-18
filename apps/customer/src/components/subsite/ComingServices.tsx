import { COMING_SERVICES } from "../../lib/services.js";
import { Section, bodyText } from "./Section.js";

/**
 * "Coming to CRAL" (`id="coming"`, the target of `/#coming`): every
 * registry entry with `status: 'coming'`, shown once, here only
 * (proposal 4.5). Title and sub are the canvas `vertDefs` copy verbatim.
 *
 * Rows are not links: there is no page behind them yet. Each row has one
 * real "Tell me when it opens" `mailto:` hand-off, the same decision
 * `VerticalPage.tsx` recorded before UI1b removed it (no fake sign-up
 * form that goes nowhere).
 * The pill is neutral grey with a word, never a status colour.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.5 and 5.1.
 */
export function ComingServices({ heading = "More of what a vehicle needs." }: { heading?: string }): JSX.Element {
  return (
    <Section id="coming" overline="COMING TO CRAL" heading={heading}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
          gap: "clamp(14px,2vw,20px)",
        }}
      >
        {COMING_SERVICES.map((s) => {
          const Icon = s.icon;
          const mail = `mailto:hello@cral.co.ke?subject=${encodeURIComponent(
            `Tell me when ${s.label.toLowerCase()} opens`,
          )}`;
          return (
            <div
              key={s.key}
              style={{
                display: "flex",
                flexDirection: "column",
                background: "#FFFFFF",
                border: "1px solid #E4E7EC",
                borderRadius: 12,
                padding: "18px 18px 14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Icon size={22} aria-hidden="true" color="#5A6373" style={{ flex: "none" }} />
                <span style={{ flex: 1, font: "600 15px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
                  {s.label}
                </span>
                <span
                  style={{
                    padding: "4px 9px",
                    background: "#F1F3F6",
                    border: "1px solid #E4E7EC",
                    borderRadius: 999,
                    font: "600 10px/1.4 'IBM Plex Mono',monospace",
                    letterSpacing: ".08em",
                    color: "#5A6373",
                  }}
                >
                  {s.pill}
                </span>
              </div>
              <div
                style={{
                  font: "600 16px/1.3 Archivo,sans-serif",
                  fontVariationSettings: "'wdth' 106",
                  color: "#0B0F1A",
                  marginBottom: 6,
                }}
              >
                {s.title}
              </div>
              <p style={{ ...bodyText, flex: 1 }}>{s.sub}</p>
              <a
                href={mail}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  alignSelf: "flex-start",
                  minHeight: 44,
                  marginTop: 6,
                  font: "600 14px/1 'Instrument Sans',sans-serif",
                  color: "#0F23A8",
                  textDecoration: "none",
                }}
              >
                Tell me when it opens
              </a>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

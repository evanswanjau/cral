import type { CSSProperties, ReactNode } from "react";

/**
 * The section frame the sub-site components share: page gutter, max
 * width, a mono overline and an optional Archivo heading. Kept here so
 * each component stays small and every section lines up.
 */
export function Section({
  id,
  overline,
  heading,
  children,
  style,
}: {
  id?: string;
  overline: string;
  heading?: string;
  children: ReactNode;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <section id={id} style={{ padding: "clamp(30px,4.4vw,56px) clamp(16px,4vw,40px)", ...style }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div
          style={{
            font: "500 10px/1 'IBM Plex Mono',monospace",
            letterSpacing: ".11em",
            color: "#838C9B",
            marginBottom: heading ? 10 : 18,
          }}
        >
          {overline}
        </div>
        {heading && (
          <h2
            style={{
              margin: "0 0 clamp(18px,2.6vw,28px)",
              font: "700 clamp(22px,2.8vw,32px)/1.12 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 110",
              letterSpacing: "-.024em",
              color: "#0B0F1A",
              maxWidth: 680,
              textWrap: "balance",
            }}
          >
            {heading}
          </h2>
        )}
        {children}
      </div>
    </section>
  );
}

export const bodyText: CSSProperties = {
  margin: 0,
  font: "400 14px/1.6 'Instrument Sans',sans-serif",
  color: "#5A6373",
  textWrap: "pretty",
};

export const itemTitle: CSSProperties = {
  font: "600 16px/1.3 Archivo,sans-serif",
  fontVariationSettings: "'wdth' 106",
  color: "#0B0F1A",
  marginBottom: 6,
};

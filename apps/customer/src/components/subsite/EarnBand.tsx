import { merchantLandingUrl } from "../../lib/merchant-app.js";

/**
 * The supplier band at the foot of a sub-site: "Have a truck? Earn with
 * CRAL". Links to the merchant site's `/`, or to a `/join/<type>` page
 * when the caller passes `joinPath` (`/join/cars`, `trucks`, `machinery`,
 * `drivers` from UI4, `/join/garages` from GS4). Copy comes from the page. Never mentions CRAL's fee
 * percentage.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.3 and 5.1.
 */
export function EarnBand({
  heading,
  body,
  cta = "Start earning",
  joinPath,
}: {
  heading: string;
  body?: string;
  cta?: string;
  /** A merchant-site path such as `/join/trucks`; omitted, the band goes to the merchant site's `/`. */
  joinPath?: string;
}): JSX.Element {
  const href = `${merchantLandingUrl()}${joinPath ?? "/"}`;
  return (
    <section style={{ padding: "clamp(24px,3.6vw,44px) clamp(16px,4vw,40px)" }}>
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          background: "#0B0F1A",
          borderRadius: 12,
          padding: "clamp(24px,3.6vw,44px)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <div style={{ flex: "1 1 360px", minWidth: 0 }}>
          <div
            style={{
              font: "500 10px/1 'IBM Plex Mono',monospace",
              letterSpacing: ".11em",
              color: "#8C97A8",
              marginBottom: 10,
            }}
          >
            EARN WITH CRAL
          </div>
          <h2
            style={{
              margin: body ? "0 0 8px" : 0,
              font: "700 clamp(21px,2.6vw,28px)/1.15 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 110",
              letterSpacing: "-.02em",
              color: "#FFFFFF",
              textWrap: "balance",
            }}
          >
            {heading}
          </h2>
          {body && (
            <p style={{ margin: 0, font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#A7B0BE", maxWidth: 560 }}>
              {body}
            </p>
          )}
        </div>
        <a
          href={href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 44,
            padding: "0 19px",
            background: "#0F23A8",
            color: "#FFFFFF",
            borderRadius: 8,
            font: "600 14px/1 'Instrument Sans',sans-serif",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {cta}
        </a>
      </div>
    </section>
  );
}

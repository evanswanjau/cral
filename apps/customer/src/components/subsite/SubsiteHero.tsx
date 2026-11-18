import type { ReactNode } from "react";
import type { LiveService } from "../../lib/services.js";

/**
 * A sub-site's hero: ink background with the service's photo shaded under
 * it, the one skewed rule of the surface in the overline, then the
 * registry's kicker, H1 and lede, and a slot for the task widget (search
 * card, request form) via `children`. On desktop the copy sits left and
 * the widget right; at 375px they stack.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 4.3 and 5.3.
 */
export function SubsiteHero({ service, children }: { service: LiveService; children?: ReactNode }): JSX.Element {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#0B0F1A",
        padding: "clamp(34px,5vw,64px) clamp(16px,4vw,40px) clamp(30px,4.4vw,52px)",
      }}
    >
      <img
        src={service.photo}
        alt=""
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.38,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, rgba(11,15,26,.96) 0%, rgba(11,15,26,.78) 55%, rgba(11,15,26,.55) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          maxWidth: 1240,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "clamp(24px,4vw,56px)",
        }}
      >
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span
              aria-hidden="true"
              style={{ display: "block", width: 24, height: 6, background: "#D81E32", transform: "skewX(-14deg)", flex: "none" }}
            />
            <span style={{ font: "500 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".13em", color: "#A7B0BE" }}>
              {service.kicker}
            </span>
          </div>
          <h1
            style={{
              margin: "0 0 14px",
              font: "700 clamp(30px,4.6vw,52px)/1.05 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 112",
              letterSpacing: "-.028em",
              color: "#FFFFFF",
              maxWidth: 640,
              textWrap: "balance",
            }}
          >
            {service.h1}
          </h1>
          <p
            style={{
              margin: 0,
              font: "400 clamp(15px,1.7vw,17px)/1.6 'Instrument Sans',sans-serif",
              color: "#C7CEDA",
              maxWidth: 540,
              textWrap: "pretty",
            }}
          >
            {service.lede}
          </p>
        </div>
        {children && <div style={{ flex: "1 1 340px", minWidth: 0, maxWidth: 520 }}>{children}</div>}
      </div>
    </section>
  );
}

import type { ReactNode } from "react";

/**
 * Shared building blocks for the seven marketing pages
 * (how-it-works, how-we-protect-you, corporate, about, help, contact,
 * legal). Content on these pages is NOT pulled from a canvas file - the
 * design bundle's "isPages" block is an empty shell with no per-page
 * copy, and the actual source ("Cruz Public Site Pages.dc.html", named in
 * the bundle's own manifest) was not reachable from this session (no open
 * canvas tab / project link). Written instead in the confirmed real
 * token system (packages/ui/src/tokens.ts, the fonts already self-hosted
 * for Home) and the visual idiom Home.tsx already established - kicker +
 * skewed rule, Archivo wdth headlines, Instrument Sans body. Swap for the
 * canonical canvas copy once that file is pulled (docs/plans C9).
 */

export function Kicker({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
      <span
        style={{
          display: "block",
          width: 18,
          height: 5,
          background: "#D81E32",
          transform: "skewX(-14deg)",
          flex: "none",
        }}
      />
      <span
        style={{
          font: "500 10px/1 'IBM Plex Mono',monospace",
          letterSpacing: ".12em",
          color: "#838C9B",
        }}
      >
        {children}
      </span>
    </div>
  );
}

export function PageHero({
  kicker,
  title,
  sub,
}: {
  kicker: string;
  title: string;
  sub?: string;
}): JSX.Element {
  return (
    <div style={{ padding: "clamp(28px,4vw,44px) clamp(16px,4vw,40px) clamp(14px,2vw,22px)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Kicker>{kicker}</Kicker>
        <h1
          style={{
            margin: "0 0 10px",
            font: "700 clamp(28px,4vw,42px)/1.1 Archivo,sans-serif",
            fontVariationSettings: "'wdth' 110",
            letterSpacing: "-.028em",
            color: "#0B0F1A",
          }}
        >
          {title}
        </h1>
        {sub && (
          <p
            style={{
              margin: 0,
              font: "400 16px/1.6 'Instrument Sans',sans-serif",
              color: "#5A6373",
              maxWidth: 560,
            }}
          >
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

export function Section({
  children,
  tint,
}: {
  children: ReactNode;
  tint?: boolean;
}): JSX.Element {
  return (
    <div
      style={{
        padding: "clamp(18px,2.6vw,28px) clamp(16px,4vw,40px)",
        background: tint ? "#F8F9FB" : "transparent",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }): JSX.Element {
  return (
    <h2
      style={{
        margin: "0 0 12px",
        font: "700 clamp(19px,2.4vw,24px)/1.2 Archivo,sans-serif",
        fontVariationSettings: "'wdth' 106",
        letterSpacing: "-.02em",
        color: "#0B0F1A",
      }}
    >
      {children}
    </h2>
  );
}

export function Body({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p style={{ margin: "0 0 14px", font: "400 15px/1.65 'Instrument Sans',sans-serif", color: "#333B4A" }}>
      {children}
    </p>
  );
}

export function Card({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E4E7EC",
        borderRadius: 12,
        padding: "clamp(18px,2.4vw,22px)",
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

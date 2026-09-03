import type { CSSProperties } from "react";

const PROOF = [
  {
    title: "Answer requests in one tap",
    body: "Hirers pay CRAL up front, so your yes is money already on the way - not a promise to chase.",
  },
  {
    title: "Get paid your way",
    body: "M-Pesa, bank transfer, or invoiced terms for corporate hirers - payouts move as soon as each booking wraps.",
  },
  {
    title: "List as many vehicles as you want",
    body: "One account, one fleet - add your next car whenever you're ready, with no cap on how many.",
  },
];

/**
 * The dark panel, reproduced from the design canvas source
 * ("Cruz Merchant Login.dc.html") with its exact inline styles - the
 * clamp() sizing, the 14° skewed red rule, the Archivo 'wdth' 110 display
 * axis, and the radial glow anchored to this panel's bottom-right corner.
 */
export function BrandPanel(): JSX.Element {
  return (
    <div style={S.panel}>
      <div style={S.masthead}>
        <img src="/logo-white.png" alt="Cruz Ride Auto Limited" style={S.logo} />
        <span style={S.mastheadRule} />
        <span style={S.mastheadLabel}>MERCHANT PORTAL</span>
      </div>

      <div style={S.middle}>
        <div style={S.eyebrow}>
          <span style={S.eyebrowRule} />
          <span style={S.eyebrowText}>CRAL · NAIROBI, KENYA</span>
        </div>
        <h1 style={S.h1}>Your vehicles, your money, in one place.</h1>
        <p style={S.lede}>
          Sign in to answer booking requests, track what each vehicle earns, and get paid the moment
          each trip wraps.
        </p>

        <div style={S.proofList}>
          {PROOF.map((p) => (
            <div key={p.title} style={S.proofRow}>
              <span style={S.proofCheck}>✓</span>
              <div>
                <div style={S.proofTitle}>{p.title}</div>
                <div style={S.proofBody}>{p.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.footer}>
        <span style={S.footerLeft}>© 2026 CRAL · CRAL.CO.KE</span>
        <span style={S.footerRight}>Stuck? Call 0733 376 061</span>
      </div>

      <div style={S.glow} />
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  panel: {
    background: "#0B0F1A",
    padding: "clamp(20px,3.4vw,48px) clamp(20px,4vw,56px)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: "clamp(22px,3.4vw,40px)",
    position: "relative",
    overflow: "hidden",
  },
  masthead: { display: "flex", alignItems: "center", gap: 14, position: "relative", zIndex: 2 },
  logo: {
    height: "clamp(40px,7vw,50px)",
    width: "auto",
    display: "block",
  },
  mastheadRule: { width: 1, height: 22, background: "#242C3D" },
  mastheadLabel: {
    font: "500 11px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".09em",
    color: "#8C97A8",
  },

  middle: { position: "relative", zIndex: 2, maxWidth: 520 },
  eyebrow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 18 },
  eyebrowRule: {
    display: "block",
    width: 24,
    height: 5,
    background: "#D81E32",
    transform: "skewX(-14deg)",
    flex: "none",
  },
  eyebrowText: {
    font: "500 11px/1.4 'IBM Plex Mono',monospace",
    letterSpacing: ".14em",
    color: "#8C97A8",
  },
  h1: {
    margin: "0 0 16px",
    font: "700 clamp(30px,4.4vw,46px)/1.05 Archivo,sans-serif",
    fontVariationSettings: "'wdth' 110",
    letterSpacing: "-.028em",
    color: "#FFFFFF",
    textWrap: "balance",
  } as CSSProperties,
  lede: {
    margin: "0 0 28px",
    font: "400 clamp(14px,1.4vw,16px)/1.6 'Instrument Sans',sans-serif",
    color: "#A7B0BE",
    maxWidth: "46ch",
    textWrap: "pretty",
  } as CSSProperties,

  proofList: { display: "grid", gap: 14 },
  proofRow: { display: "flex", alignItems: "flex-start", gap: 12 },
  proofCheck: {
    width: 22,
    height: 22,
    borderRadius: 999,
    background: "#141B2B",
    border: "1px solid #242C3D",
    color: "#57D69E",
    font: "600 10px/20px 'IBM Plex Mono',monospace",
    textAlign: "center",
    flex: "none",
  },
  proofTitle: { font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#F2F5F9" },
  proofBody: {
    font: "400 13px/1.5 'Instrument Sans',sans-serif",
    color: "#8C97A8",
    marginTop: 2,
    maxWidth: "44ch",
    textWrap: "pretty",
  } as CSSProperties,

  footer: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    paddingTop: 22,
    borderTop: "1px solid #1D2637",
  },
  footerLeft: {
    font: "500 11px/1.6 'IBM Plex Mono',monospace",
    letterSpacing: ".08em",
    color: "#5F6B7C",
  },
  footerRight: { font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#5F6B7C" },

  glow: {
    position: "absolute",
    right: -120,
    bottom: -140,
    width: 420,
    height: 420,
    borderRadius: 999,
    background: "radial-gradient(circle,rgba(15,35,168,.42),rgba(11,15,26,0) 68%)",
    zIndex: 1,
  },
};

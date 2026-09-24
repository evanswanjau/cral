import type { CSSProperties } from "react";

/**
 * Auth screen styles. Deliberately the merchant portal's own values
 * (`apps/merchant/src/components/auth/styles.ts`, itself verbatim from
 * "Cruz Merchant Login.dc.html") so the two sign-ins read as one product -
 * owner's call, 2026-09-24. The apps stay separate Vite apps, so this is a
 * copy rather than a shared import; keep the two in step.
 */
export const S = {
  page: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,430px),1fr))",
    fontFamily: "'Instrument Sans',sans-serif",
  },
  formPanel: {
    background: "#FAFBFC",
    padding: "clamp(24px,4vw,48px) clamp(20px,4vw,56px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  formInner: { width: "100%", maxWidth: 420 },
  formStack: { display: "grid", gap: 16 },

  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 22,
    font: "600 13px/1 'Instrument Sans',sans-serif",
    color: "#5A6373",
    textDecoration: "none",
  },

  heading: {
    margin: "0 0 7px",
    font: "600 clamp(24px,3vw,30px)/1.15 Archivo,sans-serif",
    fontVariationSettings: "'wdth' 106",
    letterSpacing: "-.022em",
    color: "#0B0F1A",
  },
  subheading: {
    margin: 0,
    font: "400 14px/1.55 'Instrument Sans',sans-serif",
    color: "#5A6373",
    textWrap: "pretty",
  },

  label: {
    display: "block",
    font: "500 10px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".1em",
    color: "#9AA2B0",
    marginBottom: 8,
  },
  labelRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  input: {
    width: "100%",
    height: 48,
    padding: "0 14px",
    background: "#FFFFFF",
    border: "1px solid #CDD2DA",
    borderRadius: "var(--r)",
    font: "400 15px/1 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
  },
  helper: { font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 8 },
  inlineBtn: {
    background: "none",
    border: "none",
    padding: 0,
    font: "600 12px/1 'Instrument Sans',sans-serif",
    color: "#0F23A8",
    cursor: "pointer",
  },
  splitRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  smallLink: {
    background: "none",
    border: "none",
    padding: 0,
    font: "600 13px/1 'Instrument Sans',sans-serif",
    color: "#0F23A8",
    cursor: "pointer",
    textDecoration: "none",
  },

  primaryBtn: {
    height: 50,
    background: "#0F23A8",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "var(--r)",
    font: "600 15px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
    transition: "background 120ms cubic-bezier(.2,.8,.25,1)",
  },

  infoBanner: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "13px 15px",
    background: "#EDEFFC",
    border: "1px solid #C3CBF5",
    borderRadius: "var(--r)",
  },
  infoDot: { width: 8, height: 8, borderRadius: 999, background: "#0F23A8", flex: "none" },
  infoText: { flex: 1, minWidth: "min(100%,140px)", font: "600 13px/1.45 'Instrument Sans',sans-serif", color: "#0F23A8" },

  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    marginTop: 16,
    padding: "13px 15px",
    background: "#FDE7EA",
    border: "1px solid #F7BDC5",
    borderRadius: "var(--r)",
  },
  errorDot: { width: 8, height: 8, borderRadius: 999, background: "#D81E32", flex: "none" },
  errorText: { font: "600 13px/1.45 'Instrument Sans',sans-serif", color: "#A50E22" },

  bottom: { marginTop: 24, paddingTop: 20, borderTop: "1px solid #E4E7EC", display: "grid", gap: 14 },
  bottomRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  bottomText: { font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  bottomLink: {
    font: "600 14px/1.5 'Instrument Sans',sans-serif",
    color: "#0F23A8",
    textDecoration: "none",
    borderBottom: "1px solid rgba(15,35,168,.26)",
  },

  termsLink: { color: "#0F23A8", textDecoration: "underline", textUnderlineOffset: 2 },
  terms: {
    margin: 0,
    font: "400 12px/1.55 'Instrument Sans',sans-serif",
    color: "#838C9B",
    textWrap: "pretty",
  },
} satisfies Record<string, CSSProperties>;

import type { CSSProperties } from "react";

/**
 * Auth screen styles, taken verbatim from the design canvas source
 * ("Cruz Merchant Login.dc.html"). That file is the whole auth flow — one
 * template with `sc-if` branches for password sign-in, phone entry, code
 * entry, register and register-verify — so these values are shared across
 * every auth screen rather than re-derived per page.
 *
 * Keep these as literal values. Re-expressing them as Tailwind utilities is
 * what caused the screens to drift from the design previously.
 */
export const S = {
  // --- layout ---------------------------------------------------------
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

  // --- headings -------------------------------------------------------
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

  // --- google + divider ----------------------------------------------
  googleBtn: {
    height: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    background: "#FFFFFF",
    border: "1px solid #CDD2DA",
    borderRadius: "var(--r)",
    font: "600 15px/1 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
    cursor: "pointer",
    transition: "background 120ms cubic-bezier(.2,.8,.25,1)",
  },
  rule: { flex: 1, height: 1, background: "#E4E7EC" },
  orLabel: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#9AA2B0" },

  // --- segmented control ----------------------------------------------
  segment: { display: "flex", gap: 4, padding: 4, background: "#F1F3F6", borderRadius: 999, marginBottom: 20 },
  segmentBtn: {
    flex: 1,
    height: 38,
    border: "none",
    borderRadius: 999,
    font: "600 13px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
    transition: "background 120ms cubic-bezier(.2,.8,.25,1)",
  },

  // --- fields ----------------------------------------------------------
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
  /** The six-digit OTP field — deliberately larger and monospaced. */
  codeInput: {
    width: "100%",
    height: 56,
    padding: "0 16px",
    background: "#FFFFFF",
    border: "1px solid #CDD2DA",
    borderRadius: "var(--r)",
    font: "600 26px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".34em",
    color: "#0B0F1A",
    textAlign: "center",
  },
  phonePrefix: {
    height: 48,
    padding: "0 13px",
    display: "inline-flex",
    alignItems: "center",
    background: "#F1F3F6",
    border: "1px solid #CDD2DA",
    borderRadius: "var(--r)",
    font: "500 15px/1 'IBM Plex Mono',monospace",
    color: "#333B4A",
    flex: "none",
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

  // --- remember / forgot row -------------------------------------------
  splitRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  checkboxBtn: { display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", padding: 0, cursor: "pointer" },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: "var(--r-sm)",
    color: "#FFFFFF",
    font: "600 11px/18px 'IBM Plex Mono',monospace",
    textAlign: "center",
    flex: "none",
  },
  checkboxLabel: { font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#333B4A" },
  smallLink: {
    background: "none",
    border: "none",
    padding: 0,
    font: "600 13px/1 'Instrument Sans',sans-serif",
    color: "#0F23A8",
    cursor: "pointer",
    textDecoration: "none",
  },

  // --- buttons ----------------------------------------------------------
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

  // --- banners -----------------------------------------------------------
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
  infoText: { flex: 1, minWidth: 140, font: "600 13px/1.45 'Instrument Sans',sans-serif", color: "#0F23A8" },

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

  // --- footer link row ----------------------------------------------------
  bottom: { marginTop: 24, paddingTop: 20, borderTop: "1px solid #E4E7EC", display: "grid", gap: 14 },
  bottomRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  bottomText: { font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  bottomLink: {
    font: "600 14px/1.5 'Instrument Sans',sans-serif",
    color: "#0F23A8",
    textDecoration: "none",
    borderBottom: "1px solid rgba(15,35,168,.26)",
  },

  resendLine: { font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" },
  terms: {
    margin: 0,
    font: "400 12px/1.55 'Instrument Sans',sans-serif",
    color: "#838C9B",
    textWrap: "pretty",
  },
} satisfies Record<string, CSSProperties>;

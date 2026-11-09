import type { CSSProperties } from "react";

/**
 * Shared look for the review screens (vehicle case + merchant file). Values
 * are the console's own - the same ones the vehicle case used inline - so
 * the two screens read as one tool.
 */
export const RS = {
  loading: { padding: 40, font: "400 13px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" },
  link: { background: "none", border: "none", padding: 0, color: "#0F23A8", cursor: "pointer", font: "600 13px/1 'Instrument Sans',sans-serif" },
  back: { display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px 0 8px", marginBottom: 14, background: "transparent", color: "#5A6373", border: "none", borderRadius: "var(--r-sm)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  card: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", padding: "clamp(18px,2.6vw,24px)", marginBottom: 16 },
  h1: { margin: "0 0 6px", font: "600 clamp(24px,3.2vw,30px)/1.1 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.022em", color: "#1A1F2B" },
  subline: { font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  kicker: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#9AA2B0", marginBottom: 6 },
  statePill: { display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", border: "1px solid", borderRadius: 999, font: "600 13px/1.2 'Instrument Sans',sans-serif" },
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px", borderBottom: "1px solid #F1F3F6", flexWrap: "wrap" },
  panelTitle: { font: "600 15px/1.2 Archivo,sans-serif", color: "#1A1F2B" },
  panelSub: { font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 3 },
  panelFoot: { padding: "12px 18px", background: "#FFFFFF", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  smallBtn: { height: 32, padding: "0 12px", background: "#FFFFFF", color: "#0F23A8", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer", whiteSpace: "nowrap" },
  actBtn: { height: 40, padding: "0 17px", border: "none", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer", whiteSpace: "nowrap" },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1px solid", borderRadius: 999, font: "600 12px/1.2 'Instrument Sans',sans-serif", whiteSpace: "nowrap" },
  mono: { font: "500 11px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".05em" },
  bar: { height: 6, borderRadius: 999, background: "#F1F3F6", overflow: "hidden", display: "flex" },
  avatar: { width: 36, height: 36, borderRadius: 999, background: "#F1F3F6", color: "#0F23A8", font: "600 12px/36px 'IBM Plex Mono',monospace", textAlign: "center", flex: "none" },
  kv: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  kvKey: { font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" },
  kvVal: { font: "600 13px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B", textAlign: "right", overflowWrap: "anywhere" },
  textarea: { width: "100%", minHeight: 84, padding: 13, border: "1.5px solid #E4E7EC", borderRadius: "var(--r)", font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#1A1F2B", background: "#FFFFFF", resize: "vertical" },
  fieldLabel: { display: "block", font: "600 13px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B", marginBottom: 7 },
  hint: { padding: "13px 15px", borderRadius: "var(--r)", font: "400 13px/1.55 'Instrument Sans',sans-serif" },
  toast: { position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 11, padding: "13px 18px", background: "#F1F3F6", borderRadius: 999, boxShadow: "0 12px 32px rgba(11,15,26,.3)", zIndex: 70, maxWidth: "calc(100vw - 32px)" },
  overlay: { position: "fixed", inset: 0, background: "rgba(11,15,26,.44)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 },
  modal: { width: "100%", background: "#FFFFFF", borderRadius: "var(--r-lg)", boxShadow: "0 24px 60px rgba(11,15,26,.28)", maxHeight: "88vh", overflowY: "auto" },
  modalHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, padding: "18px 20px", borderBottom: "1px solid #F1F3F6" },
  modalX: { width: 30, height: 30, background: "#F1F3F6", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", color: "#5A6373", font: "400 15px/1 'Instrument Sans',sans-serif", cursor: "pointer", flex: "none" },
  modalFoot: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "16px 20px", borderTop: "1px solid #F1F3F6", flexWrap: "wrap" },
  cancelBtn: { height: 42, padding: "0 16px", background: "transparent", color: "#5A6373", border: "1px solid transparent", borderRadius: "var(--r)", font: "600 14px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  ctaBtn: { height: 42, padding: "0 20px", color: "#FFFFFF", border: "none", borderRadius: "var(--r)", font: "600 14px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
} satisfies Record<string, CSSProperties>;

/** Button tones for the decision dock and the section menus. */
export const TONE_BTN = {
  approve: { background: "#0B8A5B", color: "#FFFFFF", border: "1px solid #0B8A5B" },
  primary: { background: "#0F23A8", color: "#FFFFFF", border: "1px solid #0F23A8" },
  changes: { background: "#FFFFFF", color: "#8A5200", border: "1px solid #F5D9A3" },
  changesSolid: { background: "#C77400", color: "#FFFFFF", border: "1px solid #C77400" },
  reject: { background: "#FFFFFF", color: "#A50E22", border: "1px solid #F7BDC5" },
  quiet: { background: "#FFFFFF", color: "#5A6373", border: "1px solid #E4E7EC" },
  disabled: { background: "#F1F3F6", color: "#9AA2B0", border: "1px solid #E4E7EC", cursor: "not-allowed" },
} satisfies Record<string, CSSProperties>;

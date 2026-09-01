import type { CSSProperties } from "react";

/**
 * Merchant portal shell + Vehicles screen styles, taken verbatim from the
 * design bundle's "Cruz Merchant Portal.dc.html" (see CLAUDE.md's "Getting
 * the real screen source" note — every value here is a literal read off
 * that file's inline styles, not a screenshot guess). Kept as literal
 * values rather than Tailwind utilities, same reasoning as
 * `apps/merchant/src/components/onboarding/styles.ts`.
 */
// One shared column template for the vehicles table's header and every
// row — see `table`/`tableHead`/`row` below for why this lives outside P
// (it's a grid-template string, not a CSSProperties object).
export const TABLE_GRID_COLS =
  "minmax(96px,1fr) minmax(180px,2.4fr) minmax(120px,1.4fr) minmax(64px,.8fr) minmax(96px,1.1fr) minmax(84px,1fr) 16px";

/**
 * Payout column templates, shared by each table's header and its rows so the
 * two can never drift apart. Same reasoning as TABLE_GRID_COLS above: these
 * are grid-template strings, not CSSProperties, so they live outside P.
 *
 * Money columns are wide enough for a six-figure KES amount, and the status
 * column is wide enough for the longest label ("Processing") plus its dot.
 */
export const PAYOUT_HISTORY_COLS = "104px minmax(0,1fr) 116px 128px 16px";
export const PAYOUT_LINE_COLS = "92px minmax(0,1fr) 96px 96px 108px 16px";

export const P = {
  page: {
    minHeight: "100vh",
    background: "#FAFBFC",
    fontFamily: "'Instrument Sans',sans-serif",
    color: "#1A1F2B",
    display: "flex",
    flexDirection: "column",
    minWidth: 360,
  },

  // --- top bar ----------------------------------------------------------
  topBar: { background: "#FFFFFF", borderBottom: "1px solid #E4E7EC", padding: "13px clamp(16px,3vw,32px)" },
  topBarInner: {
    maxWidth: 1320,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  topBarLeft: { display: "flex", alignItems: "center", gap: 14 },
  logo: { height: "clamp(30px,6vw,38px)", width: "auto", display: "block" },
  topBarRule: { width: 1, height: 22, background: "#E4E7EC" },
  portalLabel: { font: "500 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".09em", color: "#838C9B" },
  skewRule: { display: "block", width: 22, height: 6, background: "#D81E32", transform: "skewX(-14deg)" },
  topBarRight: { display: "flex", alignItems: "center", gap: 12 },
  helpLink: { font: "600 13px/1 'Instrument Sans',sans-serif", color: "#5A6373", border: "none", background: "none", cursor: "pointer", textDecoration: "none" },
  topBarRuleThin: { width: 1, height: 16, background: "#E4E7EC" },

  // --- body layout --------------------------------------------------------
  body: { flex: 1, padding: "clamp(18px,3vw,28px) clamp(16px,3vw,32px) clamp(40px,6vw,64px)" },
  bodyInner: { maxWidth: 1320, margin: "0 auto", display: "flex", gap: "clamp(18px,2.6vw,30px)", alignItems: "flex-start", flexWrap: "wrap" },

  // --- side nav -------------------------------------------------------
  nav: { flex: "0 0 214px", minWidth: 214, display: "grid", gap: 3, position: "sticky", top: 20 },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    height: 42,
    padding: "0 12px",
    border: "none",
    borderRadius: "var(--r)",
    cursor: "pointer",
    textAlign: "left",
    font: "600 14px/1 'Instrument Sans',sans-serif",
    transition: "background 120ms cubic-bezier(.2,.8,.25,1)",
  },
  navItemActive: { background: "#EDEFFC", color: "#0F23A8" },
  navDot: { width: 6, height: 6, borderRadius: 999, flex: "none" },
  navLabel: { flex: 1 },
  navTag: { font: "500 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".06em" },

  main: { flex: 1, minWidth: 300 },

  // --- list heading -----------------------------------------------------
  listHead: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 },
  h1: { margin: "0 0 7px", font: "600 clamp(25px,3.4vw,32px)/1.1 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.022em", color: "#0B0F1A" },
  lede: { margin: 0, font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 560, textWrap: "pretty" },
  addButton: {
    height: 44,
    padding: "0 20px",
    background: "#0F23A8",
    color: "#fff",
    border: "none",
    borderRadius: "var(--r)",
    font: "600 14px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
    flex: "none",
    transition: "background 120ms cubic-bezier(.2,.8,.25,1)",
  },

  // --- action banner ------------------------------------------------------
  banner: { display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", background: "#FDE7EA", border: "1px solid #F7BDC5", borderRadius: "var(--r-lg)", marginBottom: 18, flexWrap: "wrap" },
  bannerDot: { width: 9, height: 9, borderRadius: 999, background: "#D81E32", flex: "none" },
  bannerTitle: { font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#A50E22" },
  bannerBody: { font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#8E2233" },
  bannerBtn: { height: 38, padding: "0 16px", background: "#D81E32", color: "#fff", border: "none", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer", flex: "none" },

  // --- filter pills -----------------------------------------------------
  filterRow: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 },
  filterPill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 36,
    padding: "0 14px",
    borderRadius: 999,
    cursor: "pointer",
    font: "600 13px/1 'Instrument Sans',sans-serif",
    transition: "all 120ms cubic-bezier(.2,.8,.25,1)",
  },

  // --- table --------------------------------------------------------------
  // One shared column template for both the header and every row, so the
  // six columns land at even, matched positions instead of a flex-grow
  // title column shoving the last three into a cramped cluster on the
  // right (that was the "big gap" — the title column absorbing all the
  // slack while docs/rate/date stayed pinned to fixed pixel widths).
  table: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  tableHead: { display: "grid", gridTemplateColumns: TABLE_GRID_COLS, alignItems: "center", columnGap: "clamp(12px,1.6vw,20px)", padding: "11px 18px", background: "#FAFBFC", borderBottom: "1px solid #E4E7EC" },
  tableHeadPlate: { font: "500 10px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  tableHeadTitle: { font: "500 10px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  tableHeadStatus: { font: "500 10px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  tableHeadDocs: { font: "500 10px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  tableHeadRate: { textAlign: "right", font: "500 10px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  tableHeadDate: { font: "500 10px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  tableHeadSpacer: {},
  row: { display: "grid", gridTemplateColumns: TABLE_GRID_COLS, alignItems: "center", columnGap: "clamp(12px,1.6vw,20px)", padding: "16px 18px", borderBottom: "1px solid #F1F3F6", cursor: "pointer", transition: "background 110ms cubic-bezier(.2,.8,.25,1)" },
  plateBadge: { display: "inline-block", padding: "5px 10px", border: "1.5px solid #0B0F1A", borderRadius: "var(--r-sm)", font: "600 14px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".05em", color: "#0B0F1A", fontVariantNumeric: "tabular-nums", justifySelf: "start" },
  rowTitleWrap: { minWidth: 0 },
  rowTitleLine: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rowTitle: { font: "600 15px/1.25 Archivo,sans-serif", color: "#0B0F1A" },
  verifiedTag: { display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", background: "#DDF3E9", border: "1px solid #A8DEC7", borderRadius: 999, font: "600 10px/1.5 'IBM Plex Mono',monospace", letterSpacing: ".05em", color: "#076945" },
  rowMeta: { font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  statusTag: { display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: 999, font: "600 12px/1.3 'Instrument Sans',sans-serif", justifySelf: "start" },
  statusDot: { width: 7, height: 7, borderRadius: 999, flex: "none" },
  docsLabel: { font: "500 12px/1.3 'IBM Plex Mono',monospace", fontVariantNumeric: "tabular-nums" },
  rateLabel: { textAlign: "right", font: "600 13px/1.3 'Instrument Sans',sans-serif", fontVariantNumeric: "tabular-nums" },
  dateLabel: { font: "400 11px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".03em", color: "#A7AEBB" },
  chevron: { font: "400 16px/1 'Instrument Sans',sans-serif", color: "#CDD2DA", justifySelf: "end" },
  tableFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 18px", background: "#FAFBFC", flexWrap: "wrap" },
  tableFooterLeft: { font: "400 12px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".04em", color: "#838C9B" },
  tableFooterRight: { font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" },

  // --- detail: back link, masthead ---------------------------------------
  backLink: { display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px 0 8px", marginBottom: 14, background: "transparent", color: "#5A6373", border: "none", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  mastCard: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", padding: "clamp(18px,2.6vw,24px)", marginBottom: 16 },
  mastTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" },
  mastTagRow: { display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap", marginBottom: 9 },
  mastPlate: { display: "inline-block", padding: "6px 12px", border: "1.5px solid #0B0F1A", borderRadius: "var(--r-sm)", font: "600 17px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".05em", color: "#0B0F1A", fontVariantNumeric: "tabular-nums" },
  mastStatus: { display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 999, font: "600 13px/1.2 'Instrument Sans',sans-serif" },
  mastStatusDot: { width: 8, height: 8, borderRadius: 999 },
  mastVerified: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#DDF3E9", border: "1px solid #A8DEC7", borderRadius: 999, font: "600 11px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".05em", color: "#076945" },
  mastH1: { margin: "0 0 6px", font: "600 clamp(24px,3.2vw,30px)/1.1 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.022em", color: "#0B0F1A" },
  mastSub: { font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  mastRefLabel: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#9AA2B0", marginBottom: 6 },
  mastRef: { display: "inline-block", padding: "5px 10px", background: "#F8F9FB", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "500 12px/1.2 'IBM Plex Mono',monospace", color: "#333B4A" },
  mastActions: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18, paddingTop: 18, borderTop: "1px solid #F1F3F6" },
  actionBtn: { height: 38, padding: "0 15px", background: "#FFFFFF", color: "#1A1F2B", border: "1px solid #CDD2DA", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  deleteBtn: { height: 38, padding: "0 15px", marginLeft: "auto", background: "#FFFFFF", color: "#A50E22", border: "1px solid #F7BDC5", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },

  // --- detail: two-column body --------------------------------------------
  detailBody: { display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" },
  detailMain: { flex: 1.55, minWidth: 320, display: "grid", gap: 16 },
  detailSide: { flex: 1, minWidth: 280, display: "grid", gap: 16 },

  // --- photos ---------------------------------------------------------
  // A shared explicit row height (not aspect-ratio on the main tile alone)
  // is what keeps the two-thumb column's rows evenly split and matched to
  // the main photo's height — grid-stretching a column with no defined row
  // tracks left the thumbs auto-sized to their own content instead.
  photoGrid: { display: "grid", gridTemplateColumns: "2fr 1fr", gridTemplateRows: "clamp(220px,26vw,320px)", gap: 8 },
  photoMain: { position: "relative", borderRadius: "var(--r-lg)", border: "1px solid #E4E7EC", background: "repeating-linear-gradient(135deg,#F1F3F6 0 10px,#FAFBFC 10px 20px)", display: "grid", placeItems: "center", overflow: "hidden", width: "100%", height: "100%" },
  photoMainLabel: { font: "500 11px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".07em", color: "#9AA2B0", textAlign: "center" },
  photoMainImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  photoAdd: { width: "100%", height: "100%", borderRadius: "var(--r-lg)", border: "1px dashed #CDD2DA", background: "#FFFFFF", display: "grid", placeItems: "center", gap: 7, cursor: "pointer", padding: 12 },
  photoAddLabel: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0F23A8" },
  photoAddHint: { font: "500 10px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: "#9AA2B0", textAlign: "center" },
  photoThumbs: { display: "grid", gridTemplateRows: "1fr 1fr", gap: 8, height: "100%" },
  photoThumb: { position: "relative", borderRadius: "var(--r)", border: "1px solid #E4E7EC", background: "repeating-linear-gradient(135deg,#F1F3F6 0 10px,#FAFBFC 10px 20px)", display: "grid", placeItems: "center", overflow: "hidden", width: "100%", height: "100%" },
  photoThumbLabel: { font: "500 10px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: "#9AA2B0" },
  photoThumbImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  photoMore: { borderRadius: "var(--r)", border: "1px solid #E4E7EC", background: "#F8F9FB", display: "grid", placeItems: "center", width: "100%", height: "100%" },
  photoMoreLabel: { font: "500 10px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: "#5A6373" },
  photoAddSmall: { width: "100%", height: "100%", borderRadius: "var(--r)", border: "1px dashed #CDD2DA", background: "#FFFFFF", display: "grid", placeItems: "center", cursor: "pointer", font: "600 11px/1.3 'Instrument Sans',sans-serif", color: "#0F23A8" },
  photoRemove: { position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 999, background: "rgba(11,15,26,.72)", color: "#FFFFFF", border: "none", display: "grid", placeItems: "center", cursor: "pointer", font: "400 13px/1 'Instrument Sans',sans-serif", zIndex: 1 },
  photoReplace: { position: "absolute", bottom: 6, right: 6, height: 26, padding: "0 10px", borderRadius: 999, background: "rgba(11,15,26,.72)", color: "#FFFFFF", border: "none", cursor: "pointer", font: "600 11px/1 'Instrument Sans',sans-serif", zIndex: 1 },

  // --- reviewer-note card ----------------------------------------------
  noteCard: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  noteBar: { height: 5 },
  noteBody: { padding: 18 },
  noteKickerRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 11 },
  noteRule: { display: "block", width: 18, height: 5, transform: "skewX(-14deg)", flex: "none" },
  noteKicker: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".11em", color: "#838C9B" },
  noteText: { margin: "0 0 14px", font: "400 14px/1.6 'Instrument Sans',sans-serif", maxWidth: "60ch", textWrap: "pretty" },
  noteMeta: { font: "400 11px/1.3 'IBM Plex Mono',monospace", color: "#A7AEBB" },

  // --- documents card -----------------------------------------------------
  card: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  cardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px", borderBottom: "1px solid #F1F3F6", flexWrap: "wrap" },
  cardTitle: { font: "600 15px/1.2 Archivo,sans-serif", color: "#0B0F1A" },
  cardHeadTag: { font: "500 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".06em" },
  ownerStrip: { display: "flex", alignItems: "center", gap: 11, padding: "12px 18px", background: "#F4FBF7", borderBottom: "1px solid #F1F3F6", flexWrap: "wrap" },
  ownerStripDot: { width: 18, height: 18, borderRadius: 999, background: "#DDF3E9", color: "#076945", font: "600 10px/18px 'IBM Plex Mono',monospace", textAlign: "center", flex: "none" },
  ownerStripText: { flex: "1 1 0%", minWidth: 220, font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", textWrap: "pretty" },
  docRow: { display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: "1px solid #F8F9FB", flexWrap: "wrap" },
  docRowDot: { width: 8, height: 8, borderRadius: 999, flex: "none" },
  docRowTitle: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" },
  docRowSub: { font: "400 12px/1.45 'Instrument Sans',sans-serif", marginTop: 2 },
  docRowState: { font: "500 11px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".05em", flex: "none" },
  docRowBtn: { height: 34, padding: "0 13px", border: "1px solid", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer", flex: "none" },
  docRowRemoveBtn: { height: 34, padding: "0 10px", background: "#FFFFFF", color: "#A50E22", border: "1px solid #F7BDC5", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer", flex: "none" },
  cardFoot: { padding: "12px 18px", background: "#FAFBFC", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },

  // --- vehicle details grid ---------------------------------------------
  specGrid: { padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "16px 18px" },
  specKey: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".09em", color: "#9AA2B0", marginBottom: 6 },
  specVal: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" },

  // --- sidebar: timeline --------------------------------------------------
  sideCard: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", padding: 18 },
  sideCardLabel: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#9AA2B0", marginBottom: 16 },
  tlRow: { display: "grid", gridTemplateColumns: "14px minmax(0,1fr)", gap: 12 },
  tlRail: { display: "flex", flexDirection: "column", alignItems: "center" },
  tlDot: { width: 9, height: 9, borderRadius: 999, marginTop: 5, flex: "none" },
  tlLine: { flex: 1, width: 1, background: "#E4E7EC", minHeight: 8 },
  tlBody: { paddingBottom: 16 },
  tlViewAll: { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "6px 0 0 26px", cursor: "pointer", font: "600 12px/1.3 'Instrument Sans',sans-serif", color: "#0F23A8" },
  tlLabel: { font: "600 13px/1.35 'Instrument Sans',sans-serif" },
  tlText: { font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", marginTop: 3, textWrap: "pretty" },
  tlWhen: { font: "400 11px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".03em", color: "#A7AEBB", marginTop: 5 },

  // --- sidebar: price & availability ---------------------------------
  priceHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 18px", borderBottom: "1px solid #F1F3F6" },
  priceEditBtn: { height: 30, padding: "0 12px", background: "#FFFFFF", color: "#0F23A8", border: "1px solid #CDD2DA", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  priceBody: { padding: "16px 18px", display: "grid", gap: 12 },
  priceRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  priceKey: { font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" },
  priceVal: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", fontVariantNumeric: "tabular-nums", textAlign: "right" },

  // --- sidebar: verified-badge upsell (black card) ------------------------
  upsell: { background: "#0B0F1A", borderRadius: "var(--r-lg)", padding: 20 },
  upsellHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 13 },
  upsellRule: { display: "block", width: 20, height: 5, background: "#D81E32", transform: "skewX(-14deg)", flex: "none" },
  upsellKicker: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".11em", color: "#8C97A8" },
  upsellTitle: { font: "600 17px/1.25 Archivo,sans-serif", fontVariationSettings: "'wdth' 108", color: "#FFFFFF", marginBottom: 9 },
  upsellBody: { margin: "0 0 15px", font: "400 13px/1.6 'Instrument Sans',sans-serif", color: "#A7B0BE", textWrap: "pretty" },
  upsellFoot: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  upsellCta: { height: 40, padding: "0 16px", background: "#FFFFFF", color: "#0B0F1A", border: "none", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  upsellNote: { font: "500 11px/1.4 'IBM Plex Mono',monospace", color: "#8C97A8" },

  // --- sidebar: payout destination ------------------------------------
  payoutCard: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", padding: "16px 18px" },
  payoutLabel: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#9AA2B0", marginBottom: 10 },
  payoutRow: { display: "flex", alignItems: "center", gap: 11 },
  payoutAvatar: { width: 34, height: 34, borderRadius: 999, background: "#DDF3E9", color: "#076945", font: "600 11px/34px 'IBM Plex Mono',monospace", textAlign: "center", flex: "none" },
  payoutName: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" },
  payoutSub: { font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" },

  // --- modal ---------------------------------------------------------
  overlay: { position: "fixed", inset: 0, background: "rgba(11,15,26,.44)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 },
  modalBox: { width: "100%", background: "#FFFFFF", borderRadius: "var(--r-lg)", boxShadow: "0 24px 60px rgba(11,15,26,.28)", overflow: "hidden", maxHeight: "88vh", overflowY: "auto" },
  modalHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, padding: "18px 20px", borderBottom: "1px solid #F1F3F6" },
  modalTitle: { font: "600 17px/1.25 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", color: "#0B0F1A" },
  modalSub: { font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", marginTop: 4, maxWidth: "52ch", textWrap: "pretty" },
  modalClose: { width: 30, height: 30, background: "#F8F9FB", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", color: "#5A6373", font: "400 15px/1 'Instrument Sans',sans-serif", cursor: "pointer", flex: "none" },
  modalBody: { padding: 20 },
  modalFoot: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "16px 20px", background: "#FAFBFC", borderTop: "1px solid #F1F3F6", flexWrap: "wrap" },
  modalCancel: { height: 42, padding: "0 16px", background: "transparent", color: "#5A6373", border: "1px solid transparent", borderRadius: "var(--r)", font: "600 14px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  modalCta: { height: 42, padding: "0 20px", color: "#FFFFFF", border: "none", borderRadius: "var(--r)", font: "600 14px/1 'Instrument Sans',sans-serif" },

  // --- modal form fields --------------------------------------------------
  fieldLabel: { display: "block", font: "600 13px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B", marginBottom: 7 },
  fieldInput: { width: "100%", height: 44, padding: "0 13px", border: "1.5px solid #CDD2DA", borderRadius: "var(--r)", font: "500 15px/1 'IBM Plex Mono',monospace", color: "#0B0F1A", background: "#FFFFFF" },
  fieldInputText: { width: "100%", height: 44, padding: "0 13px", border: "1.5px solid #CDD2DA", borderRadius: "var(--r)", font: "400 15px/1 'Instrument Sans',sans-serif", color: "#0B0F1A", background: "#FFFFFF" },
  fieldGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 16 },
  toggleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "14px 16px", background: "#F8F9FB", border: "1px solid #E4E7EC", borderRadius: "var(--r)", flexWrap: "wrap" },
  toggleRowTitle: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" },
  toggleRowSub: { font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#5A6373" },
  toggleTrack: { width: 52, height: 30, borderRadius: 999, border: "none", cursor: "pointer", padding: 3, display: "flex" },
  toggleThumb: { width: 24, height: 24, borderRadius: 999, background: "#FFFFFF", display: "block", boxShadow: "0 1px 3px rgba(11,15,26,.3)" },
  breakdown: { border: "1px solid #DCE1FA", borderRadius: "var(--r)", overflow: "hidden" },
  breakdownRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "11px 14px", background: "#EDEFFC" },
  breakdownRowTop: { borderTop: "1px solid #DCE1FA" },
  breakdownKey: { font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#333B4A" },
  breakdownVal: { font: "600 13px/1.3 'IBM Plex Mono',monospace", fontVariantNumeric: "tabular-nums" },
  breakdownNet: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "12px 14px", background: "#DCE1FA", borderTop: "1px solid #B6C0F4" },
  breakdownNetKey: { font: "600 13px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" },
  breakdownNetVal: { font: "700 21px/1 Archivo,sans-serif", fontVariationSettings: "'wdth' 108", color: "#0B0F1A", fontVariantNumeric: "tabular-nums" },
  breakdownNetPrefix: { font: "500 11px/1 'Instrument Sans',sans-serif", color: "#5A6373" },
  breakdownNote: { padding: "10px 14px", background: "#FFFFFF", borderTop: "1px solid #DCE1FA", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", textWrap: "pretty" },
  textarea: { width: "100%", minHeight: 120, padding: 13, border: "1.5px solid #CDD2DA", borderRadius: "var(--r)", font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#0B0F1A", background: "#FFFFFF", resize: "vertical" },
  reviewerCardRow: { display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", background: "#F8F9FB", border: "1px solid #E4E7EC", borderRadius: "var(--r)" },
  reviewerAvatar: { width: 30, height: 30, borderRadius: 999, background: "#EDEFFC", color: "#0F23A8", font: "600 11px/30px 'IBM Plex Mono',monospace", textAlign: "center", flex: "none" },
  helperText: { font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },

  verifyFeeCard: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "16px 18px", background: "#0B0F1A", borderRadius: "var(--r)", flexWrap: "wrap" },
  verifyFeeLabel: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#8C97A8", marginBottom: 6 },
  verifyFeeAmount: { font: "700 26px/1 Archivo,sans-serif", fontVariationSettings: "'wdth' 108", color: "#FFFFFF", fontVariantNumeric: "tabular-nums" },
  verifyFeePrefix: { font: "500 13px/1 'Instrument Sans',sans-serif", color: "#8C97A8" },
  verifyPill: { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", background: "#DDF3E9", borderRadius: 999, font: "600 11px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".05em", color: "#076945" },
  verifyPoints: { display: "grid", gap: 9 },
  verifyPoint: { display: "flex", gap: 11, alignItems: "flex-start" },
  verifyPointDot: { width: 7, height: 7, borderRadius: 999, marginTop: 6, flex: "none" },
  verifyPointText: { font: "400 13px/1.55 'Instrument Sans',sans-serif", color: "#333B4A" },
  verifyNotice: { padding: "13px 15px", background: "#FFF3DB", border: "1px solid #F5D9A3", borderRadius: "var(--r)", font: "400 13px/1.55 'Instrument Sans',sans-serif", color: "#8A5200" },

  deleteWarn: { display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", background: "#FDE7EA", border: "1px solid #F7BDC5", borderRadius: "var(--r)", flexWrap: "wrap" },
  deleteWarnPlate: { display: "inline-block", padding: "5px 10px", border: "1.5px solid #A50E22", borderRadius: "var(--r-sm)", font: "600 14px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".05em", color: "#A50E22", flex: "none" },
  deleteWarnTitle: { font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#A50E22", flex: "1 1 0%", minWidth: 160 },
  deleteBody: { font: "400 13px/1.6 'Instrument Sans',sans-serif", color: "#333B4A" },

  // --- toast --------------------------------------------------------
  toast: { position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 11, padding: "13px 18px", background: "#0B0F1A", borderRadius: 999, boxShadow: "0 12px 32px rgba(11,15,26,.3)", zIndex: 70, maxWidth: "calc(100vw - 32px)" },
  toastDot: { width: 8, height: 8, borderRadius: 999, flex: "none" },
  toastText: { font: "500 13px/1.35 'Instrument Sans',sans-serif", color: "#F2F5F9" },

  // --- skeleton row (loading) --------------------------------------------
  skeletonRow: { display: "grid", gridTemplateColumns: TABLE_GRID_COLS, alignItems: "center", columnGap: "clamp(12px,1.6vw,20px)", padding: "16px 18px", borderBottom: "1px solid #F1F3F6" },
  skeletonBar: { borderRadius: 4, background: "#F1F3F6", flex: "none" },

  // --- empty state --------------------------------------------------------
  emptyWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "64px 24px", textAlign: "center" },
  emptyIcon: { width: 44, height: 44, borderRadius: 999, background: "#F1F3F6", display: "grid", placeItems: "center", color: "#9AA2B0" },
  emptyTitle: { font: "600 16px/1.3 Archivo,sans-serif", color: "#0B0F1A" },
  emptyBody: { margin: 0, font: "400 13px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 360 },

  // --- Payouts ------------------------------------------------------------
  // Literal reads off "Cruz Merchant Bookings & Payouts.dc.html". Prefixed
  // `po` because `payoutCard`/`payoutRow`/... above are already taken by the
  // Vehicles detail screen's payout-destination side card.
  poTileGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(212px,1fr))", gap: 12, marginBottom: 16 },
  poTile: { borderRadius: "var(--r-lg)", padding: 18 },
  poTileHead: { display: "flex", alignItems: "center", gap: 9, marginBottom: 13 },
  poTileDot: { width: 8, height: 8, borderRadius: 999, flex: "none" },
  poTileKicker: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".1em" },
  poTileValue: { font: "700 clamp(24px,2.6vw,29px)/1 Archivo,sans-serif", fontVariationSettings: "'wdth' 108", fontVariantNumeric: "tabular-nums", marginBottom: 7 },
  poTileUnit: { font: "500 12px/1 'Instrument Sans',sans-serif" },
  poTileSub: { font: "400 12px/1.45 'Instrument Sans',sans-serif" },

  poHistoryHead: { display: "grid", gridTemplateColumns: PAYOUT_HISTORY_COLS, alignItems: "center", gap: 16, padding: "11px 18px", background: "#F8F9FB", borderBottom: "1px solid #E4E7EC" },
  poHistoryHeadCell: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".09em", color: "#9AA2B0" },
  poHistoryRow: { display: "grid", gridTemplateColumns: PAYOUT_HISTORY_COLS, alignItems: "center", gap: 16, padding: "15px 18px", borderBottom: "1px solid #F1F3F6", cursor: "pointer", transition: "background 110ms cubic-bezier(.2,.8,.25,1)" },
  poRefChip: { display: "block", padding: "5px 4px", border: "1.5px solid #0B0F1A", borderRadius: "var(--r-sm)", font: "600 12px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".01em", color: "#0B0F1A", textAlign: "center" },
  poHistoryDate: { font: "500 12px/1.35 'IBM Plex Mono',monospace", letterSpacing: ".01em", color: "#0B0F1A", whiteSpace: "nowrap" },
  poHistoryCovers: { font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  poHistoryNet: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  poHistoryGross: { font: "400 11px/1.4 'Instrument Sans',sans-serif", color: "#A7AEBB", marginTop: 2, whiteSpace: "nowrap" },
  poStatusPill: { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 999, font: "600 11px/1.4 'Instrument Sans',sans-serif", whiteSpace: "nowrap", maxWidth: "100%" },
  poStatusDot: { width: 7, height: 7, borderRadius: 999, flex: "none" },

  // --- payout detail ------------------------------------------------------
  poMastRef: { display: "inline-block", padding: "6px 12px", border: "1.5px solid #0B0F1A", borderRadius: "var(--r-sm)", font: "600 16px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".05em", color: "#0B0F1A" },
  poMastStatus: { display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 999, font: "600 13px/1.2 'Instrument Sans',sans-serif" },
  poMastAmount: { font: "700 clamp(28px,3.6vw,34px)/1 Archivo,sans-serif", fontVariationSettings: "'wdth' 108", color: "#0B0F1A", fontVariantNumeric: "tabular-nums", marginBottom: 8 },
  poMastUnit: { font: "500 13px/1 'Instrument Sans',sans-serif", color: "#838C9B" },
  poCodeChip: { display: "inline-block", padding: "6px 11px", background: "#F8F9FB", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "600 13px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: "#0B0F1A" },

  poLineRow: { display: "grid", gridTemplateColumns: PAYOUT_LINE_COLS, alignItems: "center", gap: "clamp(10px,1.2vw,18px)", padding: "15px 18px", borderBottom: "1px solid #F1F3F6", transition: "background 110ms cubic-bezier(.2,.8,.25,1)" },
  poLineRefChip: { display: "block", padding: "5px 6px", border: "1.5px solid #0B0F1A", borderRadius: "var(--r-sm)", font: "600 12px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".02em", color: "#0B0F1A", textAlign: "center" },
  poLineHirer: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" },
  poLineMeta: { font: "400 12px/1.4 'IBM Plex Mono',monospace", color: "#838C9B", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  poLineGross: { textAlign: "right", font: "400 13px/1.3 'Instrument Sans',sans-serif", color: "#5A6373", fontVariantNumeric: "tabular-nums" },
  poLineComm: { textAlign: "right", font: "400 13px/1.3 'Instrument Sans',sans-serif", color: "#A50E22", fontVariantNumeric: "tabular-nums" },
  poLineNet: { textAlign: "right", font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", fontVariantNumeric: "tabular-nums" },

  poTotals: { padding: "16px 18px", background: "#FAFBFC", display: "grid", gap: 10 },
  poTotalRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  poTotalKey: { font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" },
  poTotalVal: { font: "600 14px/1.3 'Instrument Sans',sans-serif", fontVariantNumeric: "tabular-nums" },
  poTotalNetKey: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" },
  poTotalNetVal: { font: "700 20px/1 Archivo,sans-serif", color: "#0B0F1A", fontVariantNumeric: "tabular-nums" },

  // The design gives this note card its own 14-degree rule alongside the
  // masthead's — the same documented exception the Vehicles reviewer-note
  // card relies on (a note card counts as its own surface).
  poFootnote: { display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", background: "#EDEFFC", border: "1px solid #B6C0F4", borderRadius: "var(--r-lg)", flexWrap: "wrap" },
  poFootnoteRule: { display: "block", width: 18, height: 5, background: "#D81E32", transform: "skewX(-14deg)", flex: "none" },
  poFootnoteText: { flex: 1, minWidth: 220, font: "400 13px/1.6 'Instrument Sans',sans-serif", color: "#333B4A", textWrap: "pretty" },
} satisfies Record<string, CSSProperties>;

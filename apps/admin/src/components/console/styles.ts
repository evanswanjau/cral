import type { CSSProperties } from "react";

/**
 * Ops console shell styles, taken verbatim from the design bundle
 * ("Cruz Ride Auto - Admin Console.html" → "Cruz Admin Vehicles.dc.html"
 * for the masthead + body frame, "Cruz Admin Nav.dc.html" for the nav,
 * "Cruz Admin Profile Menu.dc.html" for the account menu).
 *
 * Kept as literal values rather than Tailwind utilities, same reasoning as
 * the merchant portal's `components/portal/styles.ts`: it is what makes the
 * screens match the canvas exactly. Cross-checked against
 * `packages/ui/src/tokens.ts` — where they differ (radii 4/8/12 vs the
 * doc's 6/10/14; body ink #1A1F2B vs the neutral ramp's #0B0F1A) the
 * canvas wins, the same call the merchant portal already made.
 *
 * The console is drawn LIGHT. `tokens.ts` carries an `ops` dark palette
 * with a "compliance works long shifts" note, but every one of the twelve
 * console screens is #FAFBFC/white and nothing in the repo consumes that
 * palette — see docs/plans/admin-merchants-vehicle-review.md finding §1.
 */
export const C = {
  page: {
    minHeight: "100vh",
    background: "#FAFBFC",
    fontFamily: "'Instrument Sans',sans-serif",
    color: "#1A1F2B",
    display: "flex",
    flexDirection: "column",
    minWidth: 360,
  },

  // --- masthead ------------------------------------------------------
  topStrip: { height: 4, background: "#0F23A8" },
  mast: { background: "#FFFFFF", borderBottom: "1px solid #E4E7EC", padding: "13px clamp(16px,3vw,32px)" },
  mastInner: {
    maxWidth: 1420,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  mastLeft: { display: "flex", alignItems: "center", gap: 14 },
  logoBtn: { display: "block", padding: "7px 11px", border: "none", background: "#FFFFFF", borderRadius: "var(--r)", cursor: "pointer" },
  logo: { height: "clamp(24px,5vw,30px)", width: "auto", display: "block" },
  mastRule: { width: 1, height: 22, background: "#E4E7EC" },
  mastRuleThin: { width: 1, height: 16, background: "#E4E7EC" },
  consolePill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 11px",
    background: "#F1F3F6",
    borderRadius: 999,
    font: "500 11px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".09em",
    color: "#0B0F1A",
  },
  // The one 14° skewed rule per surface (brand doc): "round = trust,
  // angled = paid" — here it's just the masthead marker, once.
  skewRule: { display: "block", width: 22, height: 6, background: "#D81E32", transform: "skewX(-14deg)" },
  mastRight: { display: "flex", alignItems: "center", gap: 12 },
  clock: { font: "500 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: "#838C9B" },
  bellBtn: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    background: "none",
    border: "1px solid transparent",
    borderRadius: 999,
    cursor: "not-allowed",
    opacity: 0.55,
  },
  bellDot: {
    position: "absolute",
    top: 5,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "#D81E32",
    border: "1.5px solid #FFFFFF",
  },

  // --- body + nav --------------------------------------------------
  body: { flex: 1, padding: "clamp(18px,3vw,28px) clamp(16px,3vw,32px) clamp(40px,6vw,64px)" },
  bodyInner: {
    maxWidth: 1420,
    margin: "0 auto",
    display: "flex",
    gap: "clamp(18px,2.6vw,30px)",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  nav: { flex: "0 0 232px", minWidth: 232, display: "grid", gap: 3, position: "sticky", top: 20 },
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
    textDecoration: "none",
  },
  navDot: { width: 6, height: 6, borderRadius: 999, flex: "none" },
  navLabel: { flex: 1, minWidth: 0 },
  navTag: { font: "500 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".06em", flex: "none" },
  main: { flex: 1, minWidth: 300 },
} satisfies Record<string, CSSProperties>;

/** Account-menu styles ("Cruz Admin Profile Menu.dc.html"). */
export const PM = {
  root: { position: "relative", fontFamily: "'Instrument Sans',sans-serif" },
  trigger: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "4px 8px 4px 4px",
    background: "none",
    border: "1px solid transparent",
    borderRadius: 999,
    cursor: "pointer",
    textAlign: "left",
    transition: "background 120ms cubic-bezier(.2,.8,.25,1)",
  },
  avatar: (size: number): CSSProperties => ({
    width: size,
    height: size,
    borderRadius: 999,
    background: "#F1F3F6",
    color: "#0F23A8",
    font: `600 ${size === 30 ? 12 : 14}px/${size}px 'IBM Plex Mono',monospace`,
    textAlign: "center",
    flex: "none",
  }),
  triggerName: { display: "block", font: "600 13px/1.2 'Instrument Sans',sans-serif", color: "#1A1F2B" },
  triggerRole: { display: "block", font: "400 11px/1.3 'Instrument Sans',sans-serif", color: "#838C9B" },
  menu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    width: 270,
    background: "#FFFFFF",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r-lg)",
    boxShadow: "0 18px 44px -14px rgba(11,15,26,.28),0 2px 6px rgba(11,15,26,.06)",
    zIndex: 60,
    overflow: "hidden",
  },
  head: { padding: "15px 16px 14px", borderBottom: "1px solid #F1F3F6" },
  headRow: { display: "flex", alignItems: "center", gap: 11, marginBottom: 12 },
  headName: {
    font: "600 14px/1.25 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headEmail: {
    font: "400 12px/1.35 'Instrument Sans',sans-serif",
    color: "#838C9B",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  roleRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F1F3F6", borderRadius: "var(--r)" },
  roleName: {
    flex: 1,
    minWidth: 0,
    font: "600 12px/1.3 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  roleTag: { font: "500 9px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#5A6373", flex: "none" },
  items: { padding: 6 },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: 10,
    background: "none",
    border: "none",
    borderRadius: "var(--r)",
    cursor: "pointer",
    textAlign: "left",
  },
  itemLabel: { display: "block", font: "600 13px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" },
  itemNote: { display: "block", font: "400 11px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" },
  logoutWrap: { padding: 6, borderTop: "1px solid #F1F3F6" },
  logoutBtn: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    width: "100%",
    padding: 10,
    background: "none",
    border: "none",
    borderRadius: "var(--r)",
    cursor: "pointer",
    textAlign: "left",
    font: "600 13px/1.3 'Instrument Sans',sans-serif",
    color: "#D81E32",
  },
  sessionLine: {
    padding: "9px 16px 11px",
    borderTop: "1px solid #F1F3F6",
    font: "500 9px/1.5 'IBM Plex Mono',monospace",
    letterSpacing: ".07em",
    color: "#9AA2B0",
  },
  confirmWrap: { padding: "15px 16px 16px" },
  confirmTitle: { font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#1A1F2B", marginBottom: 5 },
  confirmBody: { margin: "0 0 14px", font: "400 12px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", textWrap: "pretty" },
  confirmStack: { display: "grid", gap: 8 },
  confirmYes: {
    height: 42,
    background: "#D81E32",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "var(--r)",
    font: "600 13px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
  confirmNo: {
    height: 42,
    background: "#FFFFFF",
    color: "#1A1F2B",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r)",
    font: "600 13px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
} satisfies Record<string, CSSProperties | ((n: number) => CSSProperties)>;

/** Role slug → the label the design shows in the account menu. */
export const ROLE_LABEL: Record<string, string> = {
  admin_reviewer: "Compliance reviewer",
  admin_finance: "Finance",
  admin_support: "Support",
  admin_super: "Owner",
};

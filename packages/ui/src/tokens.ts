/**
 * Real values from "Cruz Ride Auto Limited (CRAL) — Brand Strategy" /
 * Design System v2 (the PDF export of the design canvas's token pages).
 * This is the one file everything else reads from — if the brand doc gets
 * a v3, update the values here and the shape only if the doc's shape
 * actually changed.
 *
 * Key rules from the doc, worth keeping in mind wherever these are used:
 *  - Colour never carries state alone — always pair with a dot/glyph + word.
 *  - The 14° skew is the signature move for one rule per surface (masthead,
 *    section marker, boost ribbon) — never more than once in view.
 *  - Round = trust, angled = paid. Boost is the only skewed control in the
 *    product; never skew a verification/trust element.
 *  - The wordmark ("Cruz Ride Auto") only appears inside the product on the
 *    Seal component — not as a rendered logotype scattered elsewhere.
 */

export const color = {
  ink: "#0B0F1A", // headings, ops surface base, mastheads
  cruzBlue: "#0F23A8", // primary actions, links, selection
  cruzRed: "#D81E32", // brand rule, danger, rejection
  boost: "#B5179F", // paid placement accent — never trust
  paper: "#FBF8F2", // documents and receipts only

  cruzBlueRamp: {
    50: "#EDEFFC",
    100: "#DCE1FA",
    200: "#B6C0F4",
    400: "#5B6FE0",
    600: "#0F23A8",
    700: "#0B1B85",
    900: "#060F5E",
  },

  neutral: {
    canvas: "#FAFBFC",
    50: "#F8F9FB",
    100: "#F1F3F6",
    200: "#E4E7EC",
    300: "#CDD2DA",
    400: "#A7AEBB",
    500: "#838C9B",
    600: "#5A6373",
    700: "#333B4A",
    900: "#0B0F1A",
  },

  /** The admin (ops) console is dark by default — "compliance works long shifts". */
  ops: {
    base: "#0B0F1A",
    panel: "#131A28",
    raised: "#1D2637",
    border: "#2A3346",
    muted: "#8C97A8",
    text: "#F2F5F9",
    /** Primary button lifts to this on the ops surface, for contrast on ink. */
    primaryOnOps: "#2C46D8",
  },

  /**
   * The five status states — identical meaning across all three portals.
   * Each carries core (icon/dot + text on light chips), tint (chip
   * background), border, and text — always paired with a word, never
   * colour alone.
   */
  status: {
    pending: { core: "#C77400", tint: "#FFF3DB", border: "#F5D9A3", text: "#8A5200" },
    review: { core: "#0B7BC1", tint: "#E1F1FA", border: "#A9D6EE", text: "#075D93" },
    verified: { core: "#0B8A5B", tint: "#DDF3E9", border: "#A8DEC7", text: "#076945" },
    rejected: { core: "#D81E32", tint: "#FDE7EA", border: "#F7BDC5", text: "#A50E22" },
    boosted: { core: "#B5179F", tint: "11%", border: "30%", skewDeg: -14 },
  },
} as const;

/**
 * Archivo runs on its variable "wdth" axis for display sizes (112 gives
 * headlines an engineered, signage feel instead of a neutral grotesque).
 * Instrument Sans handles UI/body text. IBM Plex Mono is for identifiers
 * and timestamps only — never body copy. All three are on Google Fonts.
 */
export const font = {
  display: '"Archivo", "Archivo Variable", sans-serif',
  sans: '"Instrument Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
} as const;

export const googleFontsHref =
  "https://fonts.googleapis.com/css2?family=Archivo:wght,wdth@100..900,75..125&family=Instrument+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap";

/** Type scale — size/line-height, weight, and (where set) wdth axis + tracking. */
export const type = {
  display: { size: "50px", lineHeight: "50px", weight: 700, wdth: 112, tracking: "-3%" },
  title: { size: "32px", lineHeight: "35px", weight: 600, wdth: 106 },
  heading: { size: "24px", lineHeight: "29px", weight: 600 },
  subhead: { size: "19px", lineHeight: "25px", weight: 600 },
  body: { size: "15px", lineHeight: "24px", weight: 400 },
  label: { size: "13px", lineHeight: "18px", weight: 600 },
  overline: { size: "11px", lineHeight: "14px", weight: 500, tracking: "+10%" },
  mono: { size: "13px", lineHeight: "20px", weight: 500 },
} as const;

export const radius = {
  sm: "6px",
  md: "10px",
  lg: "14px",
  full: "9999px",
} as const;

export const space = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  6: "24px",
  8: "32px",
} as const;

/** Control heights per §05 Buttons / §07 Form inputs. */
export const controlHeight = {
  lg: "46px",
  md: "40px",
  sm: "32px",
  icon: "32px",
} as const;

export const motion = {
  hoverFocusMs: 120,
  statusChangeMs: 180,
  panelDrawerMs: 260,
  toastMs: 200,
  easing: "cubic-bezier(.2,.8,.25,1)",
} as const;

/** The skew applied to a "boosted" (paid placement) badge, ribbon, or button — never a trust/verification element. */
export const boostedSkew = "-14deg";

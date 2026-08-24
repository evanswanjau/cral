/**
 * PLACEHOLDER TOKENS — swap these for the real exported values from the
 * design file. This is the one file everything else reads from, so
 * replacing the values here (not the shape, unless the design needs a
 * different shape) is enough to re-skin the whole component library.
 *
 * Structure follows what the spec's design-system references assume:
 *  - a five-state status badge system (pending / review / success / warning / danger)
 *  - plated, monospaced rendering for human references (BK-2301, DS-118, ...)
 *  - a "boosted" listing rendered skewed, never rounded — round is trust, angled is paid
 */

export const color = {
  neutral: {
    50: "#f8fafc",
    100: "#f1f5f9",
    300: "#cbd5e1",
    500: "#64748b",
    700: "#334155",
    900: "#0f172a",
  },
  brand: {
    500: "#dc2626",
    600: "#b91c1c",
  },
  status: {
    pending: { bg: "#f1f5f9", fg: "#475569", border: "#cbd5e1" },
    review: { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" },
    success: { bg: "#f0fdf4", fg: "#15803d", border: "#bbf7d0" },
    warning: { bg: "#fffbeb", fg: "#b45309", border: "#fde68a" },
    danger: { bg: "#fef2f2", fg: "#b91c1c", border: "#fecaca" },
  },
} as const;

export const font = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
} as const;

export const radius = {
  sm: "4px",
  md: "8px",
  full: "9999px",
} as const;

export const space = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  6: "24px",
} as const;

/** The skew applied to a "boosted" (paid placement) badge or card — never applied to a verified/trust element. */
export const boostedSkew = "-4deg";

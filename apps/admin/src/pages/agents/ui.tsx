import type { CSSProperties } from "react";
import type { AgentMerchant, AgentMerchantStatus } from "../../lib/agents-api.js";

/**
 * Shared bits for a sales agent's two screens (Phase 3, PR AG1).
 *
 * **Not from a canvas file** - no design bundle has an agent screen. Built
 * in the console's own idiom (`Renters.tsx` / `TeamTab.tsx` values, the five
 * brand status tints from `components/console/status.ts`) and flagged for
 * a swap if a canvas ever arrives. Laid out for a phone first: an agent
 * uses it in the field, so rows wrap instead of scrolling sideways.
 */

type Tone = { tint: string; border: string; text: string };

const GREY: Tone = { tint: "#F1F3F6", border: "#E4E7EC", text: "#5A6373" };
const BLUE: Tone = { tint: "#E1F1FA", border: "#A9D6EE", text: "#075D93" };
const AMBER: Tone = { tint: "#FFF3DB", border: "#F5D9A3", text: "#8A5200" };
const RED: Tone = { tint: "#FDE7EA", border: "#F7BDC5", text: "#A50E22" };
const GREEN: Tone = { tint: "#DDF3E9", border: "#A8DEC7", text: "#076945" };

const TONE: Record<AgentMerchantStatus, Tone> = {
  invited: GREY,
  onboarding: BLUE,
  submitted: AMBER,
  changes_requested: RED,
  verified: GREEN,
};

/** Glyph per state - never colour alone (brand rule). Round, never skewed: this is a trust state. */
function Glyph({ status }: { status: AgentMerchantStatus }): JSX.Element {
  const common = {
    width: 11,
    height: 11,
    viewBox: "0 0 12 12",
    "aria-hidden": true,
    style: { flex: "none", display: "block" } as CSSProperties,
  };
  switch (status) {
    case "invited":
      return (
        <svg {...common}>
          <rect x="1" y="2.5" width="10" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M1.6 3.3 6 6.6l4.4-3.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "onboarding":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6 1.4a4.6 4.6 0 0 1 0 9.2z" fill="currentColor" />
        </svg>
      );
    case "submitted":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6 3.4V6l1.8 1.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "changes_requested":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6 3.3v3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="6" cy="8.5" r=".8" fill="currentColor" />
        </svg>
      );
    case "verified":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="m3.8 6.1 1.5 1.5 2.9-3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function statusWord(m: Pick<AgentMerchant, "status" | "onboarding">): string {
  switch (m.status) {
    case "invited":
      return "Invited";
    case "onboarding":
      return `Onboarding · step ${m.onboarding.step} of ${m.onboarding.of}`;
    case "submitted":
      return "Submitted";
    case "changes_requested":
      return "Changes requested";
    case "verified":
      return "Verified";
  }
}

export function StatusChip({ m }: { m: Pick<AgentMerchant, "status" | "onboarding"> }): JSX.Element {
  const t = TONE[m.status];
  return (
    <span
      title={m.status === "onboarding" ? `Furthest step reached: ${m.onboarding.label}` : undefined}
      style={{ ...A.chip, background: t.tint, borderColor: t.border, color: t.text }}
    >
      <Glyph status={m.status} />
      {statusWord(m).toUpperCase()}
    </span>
  );
}

export const A = {
  headRow: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 },
  h1: {
    margin: "0 0 7px",
    font: "600 clamp(25px,3.4vw,32px)/1.1 Archivo,sans-serif",
    fontVariationSettings: "'wdth' 106",
    letterSpacing: "-.022em",
    color: "#1A1F2B",
  },
  lede: { margin: 0, font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 600 },
  card: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 9px",
    border: "1px solid",
    borderRadius: 999,
    font: "600 10px/1.5 'IBM Plex Mono',monospace",
    letterSpacing: ".05em",
    whiteSpace: "nowrap",
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    padding: "0 18px",
    background: "#0F23A8",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "var(--r)",
    font: "600 14px/1 'Instrument Sans',sans-serif",
    textDecoration: "none",
    cursor: "pointer",
  },
  secondaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    padding: "0 16px",
    background: "#FFFFFF",
    color: "#1A1F2B",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r)",
    font: "600 14px/1 'Instrument Sans',sans-serif",
    textDecoration: "none",
    cursor: "pointer",
  },
  smallBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 34,
    padding: "0 12px",
    background: "#FFFFFF",
    color: "#333B4A",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r-sm)",
    font: "600 12px/1 'Instrument Sans',sans-serif",
    textDecoration: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  input: {
    height: 44,
    padding: "0 12px",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r)",
    font: "400 15px/1 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
    background: "#FFFFFF",
    width: "100%",
    boxSizing: "border-box",
  },
  label: { display: "block", marginBottom: 7, font: "600 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".04em", color: "#5A6373" },
  hint: { margin: "6px 0 0", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  fieldError: { margin: "6px 0 0", font: "500 12px/1.4 'Instrument Sans',sans-serif", color: "#D81E32" },
  errorText: { margin: "12px 0 0", font: "500 13px/1.4 'Instrument Sans',sans-serif", color: "#D81E32" },
  notice: {
    display: "flex",
    alignItems: "flex-start",
    gap: 9,
    padding: "11px 14px",
    marginBottom: 14,
    background: "#FFFFFF",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r)",
    font: "500 13px/1.45 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
  },
  noticeDot: { width: 8, height: 8, marginTop: 5, borderRadius: 999, flex: "none" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  foot: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "13px 18px",
    font: "400 12px/1.4 'IBM Plex Mono',monospace",
    letterSpacing: ".04em",
    color: "#838C9B",
    flexWrap: "wrap",
  },
} satisfies Record<string, CSSProperties>;

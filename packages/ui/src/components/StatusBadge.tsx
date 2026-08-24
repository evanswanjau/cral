import type { CSSProperties } from "react";
import { color, font, radius, space } from "../tokens.js";

/**
 * The five status states from the brand doc §02 — identical meaning
 * across all three portals, never shipped as colour alone. "boosted" is
 * the one state rendered skewed (paid placement, never trust): the pill
 * itself is skewed via CSS transform, and the label text inside is
 * counter-skewed back to upright so it stays legible.
 */
export type StatusTone = "pending" | "review" | "verified" | "rejected" | "boosted";

export interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
}

const skew = color.status.boosted.skewDeg;

export function StatusBadge({ tone, label }: StatusBadgeProps): JSX.Element {
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: space[1],
    padding: `${space[1]} ${space[3]}`,
    borderRadius: radius.full,
    fontFamily: font.sans,
    fontSize: "13px",
    fontWeight: 600,
    lineHeight: 1,
    ...(tone === "boosted"
      ? { backgroundColor: color.boost, color: "#fff", border: "none", transform: `skewX(${skew}deg)` }
      : {
          backgroundColor: color.status[tone].tint,
          color: color.status[tone].text,
          border: `1px solid ${color.status[tone].border}`,
        }),
  };

  return (
    <span style={style} data-tone={tone}>
      {tone === "boosted" ? (
        <span style={{ display: "inline-block", transform: `skewX(${-skew}deg)` }}>{label}</span>
      ) : (
        label
      )}
    </span>
  );
}

import type { CSSProperties } from "react";
import { color, font, radius, space } from "../tokens.js";

/**
 * Plated, monospaced rendering for human references (spec §2): BK-2301,
 * DS-118, INV-2026-0114, PR-2026-33. Never the underlying prefixed ULID —
 * those are opaque and never shown to a person.
 */
export interface PlatedReferenceProps {
  value: string;
}

export function PlatedReference({ value }: PlatedReferenceProps): JSX.Element {
  const style: CSSProperties = {
    display: "inline-block",
    padding: `${space[1]} ${space[2]}`,
    borderRadius: radius.sm,
    fontFamily: font.mono,
    fontSize: "13px",
    letterSpacing: "0.02em",
    backgroundColor: color.neutral[100],
    color: color.neutral[700],
    border: `1px solid ${color.neutral[300]}`,
  };

  return <span style={style}>{value}</span>;
}

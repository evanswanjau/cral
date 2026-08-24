import type { CSSProperties } from "react";
import { color, font, radius, space } from "../tokens.js";

/**
 * The five-state status badge system referenced throughout the spec's state
 * machines (§27): draft/pending states, in-review states, success states
 * (live/verified/approved), warning states (expiring), and danger states
 * (rejected/suspended/expired). Callers map their own domain state to one
 * of these five tones and supply the label text.
 */
export type StatusTone = "pending" | "review" | "success" | "warning" | "danger";

export interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
}

export function StatusBadge({ tone, label }: StatusBadgeProps): JSX.Element {
  const c = color.status[tone];
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
    backgroundColor: c.bg,
    color: c.fg,
    border: `1px solid ${c.border}`,
  };

  return (
    <span style={style} data-tone={tone}>
      {label}
    </span>
  );
}

import type { CSSProperties } from "react";

/**
 * A rating shown next to a name - `★ 4.6 · 12` when there's a score, a
 * muted "Not rated yet" otherwise. Trust glyph, never colour alone
 * (design system §status), and never an all-zero score - `rating` is
 * `null`, not `{average:0,count:0}`, until someone has actually rated.
 */
export function RatingBadge({
  rating,
  empty = "Not rated yet",
  style,
}: {
  rating: { average: number; count: number } | null;
  empty?: string;
  style?: CSSProperties;
}): JSX.Element {
  const rated = rating !== null && rating.count > 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        font: "500 12px/1 'Instrument Sans',sans-serif",
        color: rated ? "#8A5200" : "#A7AEBB",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ color: rated ? "#E8A400" : "#CDD2DA", fontSize: 13 }}>
        ★
      </span>
      {rated ? rating!.average.toFixed(1) : empty}
      {rated ? <span style={{ color: "#A7AEBB" }}>· {rating!.count}</span> : null}
    </span>
  );
}

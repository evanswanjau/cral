import type { CSSProperties } from "react";
import type { RatingSummary } from "../../lib/catalog-api.js";

/**
 * A score and the number of people behind it: `★ 4.8 · 12 reviews`.
 *
 * Two brand rules are load-bearing here:
 *  - Never colour alone (design system §status): the star glyph and the
 *    word "reviews" carry the meaning, the amber only reinforces it.
 *  - `#C77400` is the brand's `status.pending.core` from
 *    `packages/ui/src/tokens.ts` - the same amber `VehicleCard` already
 *    uses for its star, so a card and the listing it opens agree.
 *
 * `rating` is `null`, never `{average:0,count:0}`, until someone has
 * actually rated - so an unrated car says so in words rather than
 * rendering a "0.0" nobody earned.
 */
export function Rating({
  rating,
  size = 14,
  empty = "Not rated yet",
  noun = "review",
  style,
}: {
  rating: RatingSummary | null;
  size?: number;
  empty?: string;
  /**
   * What the count counts. A page showing more than one score must say
   * which is which - "3 reviews" next to "3 owner reviews" is the
   * difference between two figures that inform and two that look like
   * one figure contradicting itself.
   */
  noun?: string;
  style?: CSSProperties;
}): JSX.Element {
  const rated = rating !== null && rating.count > 0;

  if (!rated) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          font: `400 ${size}px/1.4 'Instrument Sans',sans-serif`,
          color: "#838C9B",
          whiteSpace: "nowrap",
          ...style,
        }}
      >
        <span aria-hidden="true" style={{ color: "#CDD2DA" }}>
          ★
        </span>
        {empty}
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        font: `500 ${size}px/1.4 'Instrument Sans',sans-serif`,
        color: "#0B0F1A",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ color: "#C77400" }}>
        ★
      </span>
      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{rating.average.toFixed(1)}</span>
      <span style={{ color: "#5A6373", fontWeight: 400 }}>
        · {rating.count} {noun}
        {rating.count === 1 ? "" : "s"}
      </span>
    </span>
  );
}

/** The five-star run a single review carries, e.g. `★★★★☆` for four. */
export function Stars({ stars, size = 12 }: { stars: number; size?: number }): JSX.Element {
  const whole = Math.max(0, Math.min(5, Math.round(stars)));
  return (
    <span
      aria-label={`${whole} out of 5`}
      style={{ font: `500 ${size}px/1.4 'Instrument Sans',sans-serif`, letterSpacing: ".06em", color: "#C77400" }}
    >
      <span aria-hidden="true">
        {"★".repeat(whole)}
        <span style={{ color: "#CDD2DA" }}>{"★".repeat(5 - whole)}</span>
      </span>
    </span>
  );
}

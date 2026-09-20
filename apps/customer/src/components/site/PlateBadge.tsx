import type { CSSProperties } from "react";

/**
 * A vehicle registration, drawn as a Kenyan number plate: a bordered mono
 * box, ink on white, generously tracked.
 *
 * This is the same treatment the merchant portal uses
 * (`apps/merchant/src/components/onboarding/styles.ts#plateBadge`) - a
 * plate is a plate on every surface of the product, and a renter
 * comparing the car in front of them to the listing should be reading the
 * same shape the owner saw when they typed it in.
 *
 * Deliberately NOT `@cral/ui`'s `PlatedReference`: that one is for CRAL's
 * own human references (BK-2301, INV-2026-0114) and carries a tinted,
 * softer chip. A registration is a real-world object, not one of our
 * identifiers.
 */
export function PlateBadge({ value, style }: { value: string; style?: CSSProperties }): JSX.Element {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 11px",
        border: "1.5px solid #0B0F1A",
        borderRadius: 4,
        font: "600 15px/1.2 'IBM Plex Mono',monospace",
        letterSpacing: ".05em",
        color: "#0B0F1A",
        flex: "0 0 auto",
        ...style,
      }}
    >
      {value}
    </span>
  );
}

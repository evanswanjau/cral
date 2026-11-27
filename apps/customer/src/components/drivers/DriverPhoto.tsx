import { useState } from "react";
import { color, font } from "@cral/ui";
import { photoSrc } from "../../lib/catalog-api.js";

/**
 * The driver's photo (DR2, docs/plans/drivers-that-work.md), or the first
 * letter of the name when there is none or it fails to load. A picture,
 * not a check: nothing here (no badge, tick or "verified" word) says the
 * photo was looked at - it is the merchant's own upload.
 *
 * `fill` covers its (positioned) parent, the way a car card's photo fills
 * its panel; otherwise it is a `size` square with `radius` corners.
 */
export function DriverPhoto({
  name,
  photoUrl,
  size = 56,
  radius = 999,
  fill = false,
}: {
  name: string;
  photoUrl: string | null | undefined;
  size?: number;
  radius?: number;
  fill?: boolean;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  const frame = fill
    ? ({ position: "absolute", inset: 0, width: "100%", height: "100%" } as const)
    : ({ width: size, height: size, borderRadius: radius, flex: "none" } as const);

  if (photoUrl && !failed) {
    return (
      <img
        src={photoSrc(photoUrl)}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        // Faces sit in the top half of most photos; keep them in frame.
        style={{ ...frame, display: "block", objectFit: "cover", objectPosition: "center 30%" }}
      />
    );
  }
  const letterSize = fill ? 56 : Math.round(size * 0.36);
  return (
    <span
      aria-hidden="true"
      style={{
        ...frame,
        background: fill ? "transparent" : "#EDEFFC",
        color: fill ? color.neutral[400] : color.cruzBlue,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        font: `700 ${letterSize}px/1 ${font.display}`,
      }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

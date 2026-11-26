import { Star } from "@phosphor-icons/react/dist/ssr/Star";
import { color, font } from "@cral/ui";
import { photoSrc, formatMoney, type CatalogVehicleSummary } from "../../lib/catalog-api.js";
import { HIRING_UNIT_LABEL, unitRate } from "../../lib/hiring-units.js";
import { crewNote, specLine } from "../../lib/vehicle-categories.js";

/**
 * A listing card, reproduced from the design's card markup (used on the
 * home page's rails, the three hire listing pages, and anywhere else a
 * listing renders as a tile). `width` lets a rail use a fixed card width
 * while a grid lets the card fill its cell.
 *
 * Reads per type (PR H3, "Cards per type" in
 * docs/plans/hire-that-works.md):
 * - car: "Make Model Year", "5 seats · Auto · Self-drive";
 * - truck: "Make Model Year", "Flatbed · carries 10 t · With driver";
 * - machine: "Make Model" with the year small, "Excavator · With operator".
 * Trucks and machines never show seats, gearbox or self-drive.
 * A quoted listing reads "Price by quote", never a rate it won't be
 * charged at; a per-km or per-tonne guide rate is shown beside it as
 * "from ...". The H3 parts are not from a canvas; colours from tokens.ts.
 */
export const CARD_TINTS = ["#EEF0F3", "#EDEFF4", "#F0EFEC", "#EBEDF0", "#EFEEF1", "#ECEEF2"];

function PriceLine({ car }: { car: CatalogVehicleSummary }): JSX.Element {
  const unit = HIRING_UNIT_LABEL[car.hiring_unit];
  const small = { font: `400 11.5px/1 ${font.sans}`, color: color.neutral[500] } as const;
  if (car.quoted) {
    const guide =
      car.hiring_unit === "km" || car.hiring_unit === "tonne" ? (car.hiring_unit === "km" ? car.km_rate : car.tonne_rate) : null;
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
        <span style={{ font: `700 15px/1.2 ${font.display}`, fontVariationSettings: "'wdth' 106", color: color.ink }}>
          Price by quote
        </span>
        {guide && (
          <span style={small}>
            from {formatMoney(guide)} / {unit}
          </span>
        )}
      </span>
    );
  }
  return (
    <span
      style={{
        whiteSpace: "nowrap",
        font: `700 16px/1.2 ${font.display}`,
        fontVariationSettings: "'wdth' 106",
        color: color.ink,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {formatMoney(unitRate(car))}
      <span style={small}> / {unit}</span>
    </span>
  );
}

export function VehicleCard({
  car,
  tint,
  onOpen,
  width,
}: {
  car: CatalogVehicleSummary;
  tint: string;
  onOpen: () => void;
  /** Fixed pixel width for a horizontal rail; omit to fill the grid cell. */
  width?: number;
}): JSX.Element {
  const isMachine = car.category === "machinery";
  const name = `${car.make} ${car.model}${isMachine ? "" : ` ${car.year}`}`.trim();
  const spec = [specLine(car), crewNote(car)].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        flex: width ? "none" : undefined,
        width: width ?? "100%",
        // A column, not `display: block` - see the category tiles in
        // pages/Home.tsx: a button centres its content vertically when a
        // grid row stretches it taller than its content, leaving a band of
        // card background above the photo.
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        textAlign: "left",
        padding: 0,
        background: "#FFFFFF",
        border: `1px solid ${color.neutral[200]}`,
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        minWidth: 0,
      }}
    >
      <div
        style={{
          flex: "none",
          position: "relative",
          height: 150,
          background: tint,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {car.primary_photo_url ? (
          <img
            src={photoSrc(car.primary_photo_url)}
            alt={name}
            loading="lazy"
            style={{
              display: "block",
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              // Very slightly below centre. An earlier pass used `center 75%`
              // to favour the car over the sky above it, but on any photo
              // where the car already fills the frame that crops the roof
              // off - which is most listing photos, and looked broken. 58%
              // still leans away from empty sky without losing the roofline.
              objectPosition: "center 58%",
            }}
          />
        ) : (
          <span
            style={{
              font: `500 10px/1.5 ${font.mono}`,
              letterSpacing: ".1em",
              color: color.neutral[400],
              textAlign: "center",
              padding: "0 16px",
            }}
          >
            PHOTO · {name}
          </span>
        )}
        {car.verified && (
          <span
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              background: color.status.verified.tint,
              border: `1px solid ${color.status.verified.border}`,
              borderRadius: 999,
              font: `600 11px/1.4 ${font.sans}`,
              color: color.status.verified.text,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 999, background: color.status.verified.core }} />
            Verified
          </span>
        )}
        {car.county && (
          <span
            style={{
              position: "absolute",
              bottom: 10,
              right: 10,
              padding: "4px 9px",
              background: "rgba(11,15,26,.86)",
              borderRadius: 6,
              font: `500 10px/1.4 ${font.mono}`,
              letterSpacing: ".05em",
              color: "#FFFFFF",
            }}
          >
            {car.county}
          </span>
        )}
      </div>
      <div style={{ padding: "14px 15px 15px" }}>
        <div style={{ font: `600 14.5px/1.35 ${font.sans}`, color: color.ink, marginBottom: 6 }}>
          {name}
          {isMachine && car.year && (
            <span style={{ font: `400 12px/1 ${font.sans}`, color: color.neutral[500] }}> {car.year}</span>
          )}
        </div>
        <div style={{ font: `400 12.5px/1.5 ${font.sans}`, color: color.neutral[600], marginBottom: 12 }}>{spec}</div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 10,
            paddingTop: 11,
            borderTop: `1px solid ${color.neutral[100]}`,
          }}
        >
          <span style={{ flex: "none" }}>
            <PriceLine car={car} />
          </span>
          {/* The owner, and their score if a hirer has ever rated them.
              `rating` is null (never an all-zero shape) until then, so an
              unrated owner shows their name alone rather than "0.0" -
              the same honesty rule as the removed id_verified badge.
              Glyph + number, never colour alone. */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flex: "0 1 auto",
              font: `500 11.5px/1.4 ${font.sans}`,
              color: color.neutral[600],
              minWidth: 0,
            }}
          >
            {car.owner.rating && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  font: `600 11.5px/1.4 ${font.sans}`,
                  color: color.ink,
                  fontVariantNumeric: "tabular-nums",
                }}
                title={`${car.owner.rating.average} from ${car.owner.rating.count} ${
                  car.owner.rating.count === 1 ? "hire" : "hires"
                }`}
              >
                <Star size={12} weight="fill" aria-hidden="true" color={color.status.pending.core} />
                {car.owner.rating.average}
                <span style={{ color: color.neutral[500], fontWeight: 400 }}>({car.owner.rating.count})</span>
              </span>
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {car.owner.display_name}
            </span>
          </span>
        </div>
      </div>
    </button>
  );
}

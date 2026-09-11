import { photoSrc, formatMoney, type CatalogVehicleSummary } from "../../lib/catalog-api.js";

/**
 * A listing card, reproduced from the design's card markup (used on the
 * home page's rails, `/browse`'s grid, and anywhere else a car needs to
 * render as a tile). `width` lets a rail use a fixed card width while a
 * grid lets the card fill its cell.
 */
export const CARD_TINTS = ["#EEF0F3", "#EDEFF4", "#F0EFEC", "#EBEDF0", "#EFEEF1", "#ECEEF2"];

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
  const name = `${car.make} ${car.model} ${car.year}`.trim();
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        flex: width ? "none" : undefined,
        width: width ?? "100%",
        display: "block",
        textAlign: "left",
        padding: 0,
        background: "#FFFFFF",
        border: "1px solid #E4E7EC",
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      <div
        style={{
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
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            style={{
              font: "500 10px/1.5 'IBM Plex Mono',monospace",
              letterSpacing: ".1em",
              color: "#9AA2B0",
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
              background: "#DDF3E9",
              border: "1px solid #A8DEC7",
              borderRadius: 999,
              font: "600 11px/1.4 'Instrument Sans',sans-serif",
              color: "#076945",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "#0B8A5B" }} />
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
              font: "500 10px/1.4 'IBM Plex Mono',monospace",
              letterSpacing: ".05em",
              color: "#FFFFFF",
            }}
          >
            {car.county}
          </span>
        )}
      </div>
      <div style={{ padding: "14px 15px 15px" }}>
        <div
          style={{
            font: "600 14.5px/1.35 'Instrument Sans',sans-serif",
            color: "#0B0F1A",
            marginBottom: 6,
          }}
        >
          {name}
        </div>
        <div
          style={{
            font: "400 12.5px/1.5 'Instrument Sans',sans-serif",
            color: "#5A6373",
            marginBottom: 12,
          }}
        >
          {car.seats} seats · {car.transmission === "manual" ? "Manual" : "Auto"} ·{" "}
          {car.chauffeured ? "With driver" : "Self-drive"}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 10,
            paddingTop: 11,
            borderTop: "1px solid #F1F3F6",
          }}
        >
          <span
            style={{
              font: "700 16px/1.2 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 106",
              color: "#0B0F1A",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatMoney(car.daily_rate)}
            <span style={{ font: "400 11.5px/1 'Instrument Sans',sans-serif", color: "#838C9B" }}>
              {" "}
              / day
            </span>
          </span>
          <span
            style={{
              font: "500 11.5px/1.4 'Instrument Sans',sans-serif",
              color: "#5A6373",
            }}
          >
            {car.owner.display_name}
          </span>
        </div>
      </div>
    </button>
  );
}

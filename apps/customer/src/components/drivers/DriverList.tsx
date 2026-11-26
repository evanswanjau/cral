import { Link } from "react-router-dom";
import { color, font } from "@cral/ui";
import { rateLine, type PublicDriver } from "../../lib/drivers-api.js";

/**
 * The driver cards on the `/drivers` search (DR1), each opening the
 * driver's page at `/drivers/:id` with the search's rate and dates
 * carried over (`hrefFor`). Loading, empty and error states belong to the
 * page, as on `/hire`.
 *
 * Shows only the public projection: the driver's full name (owner's call,
 * 2026-10-19), county, rates and who they drive for - never an ID, KRA
 * PIN, licence number or phone (docs/decisions/drivers.md). No photo yet
 * (DR2): the first letter of the name stands in, and nothing on the card
 * claims a check the card itself can't show.
 *
 * Not from a canvas; built from tokens.ts and the `/hire` cards' frame.
 */
export function DriverList({
  drivers,
  hrefFor,
}: {
  drivers: PublicDriver[];
  hrefFor: (driver: PublicDriver) => string;
}): JSX.Element {
  return (
    <div className="cral-driver-grid">
      {drivers.map((d) => (
        <Link
          key={d.id}
          to={hrefFor(d)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            padding: "16px 18px",
            background: "#FFFFFF",
            border: `1px solid ${color.neutral[200]}`,
            borderRadius: 12,
            textDecoration: "none",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "#EDEFFC",
              color: color.cruzBlue,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              font: `700 16px/1 ${font.display}`,
              flex: "none",
            }}
          >
            {d.display_name.charAt(0)}
          </span>
          <span style={{ flex: "1 1 160px", minWidth: 0 }}>
            <span style={{ display: "block", font: `600 16px/1.3 ${font.sans}`, color: color.ink }}>
              {d.display_name}
            </span>
            <span style={{ display: "block", font: `400 13px/1.5 ${font.sans}`, color: color.neutral[600] }}>
              {d.county} · drives for {d.merchant_name}
            </span>
          </span>
          <span style={{ font: `600 14px/1.4 ${font.sans}`, color: color.ink }}>{rateLine(d)}</span>
        </Link>
      ))}
    </div>
  );
}

import { Link } from "react-router-dom";
import { color, font } from "@cral/ui";
import { formatMoney } from "../../lib/catalog-api.js";
import { UNIT_WORD, type DriverUnit, type PublicDriver } from "../../lib/drivers-api.js";
import { CARD_TINTS } from "../site/VehicleCard.js";
import { DriverPhoto } from "./DriverPhoto.js";

/**
 * The driver cards on the `/drivers` search (DR1), each opening the
 * driver's page at `/drivers/:id` with the search's rate and dates
 * carried over (`hrefFor`). Loading, empty and error states belong to the
 * page, as on `/hire`.
 *
 * Same frame as the `/hire` car card (`VehicleCard`): a photo panel on
 * top with the county chip, then name, a spec line and a price row. The
 * photo is the driver's (DR2), else the first letter of the name. It is a
 * picture, not a check, so unlike a car card there is no "Verified" pill
 * on it - nothing on the card says the photo was looked at.
 *
 * Shows only the public projection: the driver's full name (owner's call,
 * 2026-10-19), county, rates and who they drive for - never an ID, KRA
 * PIN, licence number or phone (docs/decisions/drivers.md).
 */

const UNITS: DriverUnit[] = ["day", "hour", "trip"];

/** The rate to lead with: the one searched for, else the first offered. */
function leadUnit(d: PublicDriver, unit: DriverUnit | "" | undefined): DriverUnit | null {
  if (unit && d.rates[unit]) return unit;
  return UNITS.find((u) => d.rates[u]) ?? null;
}

export function DriverList({
  drivers,
  hrefFor,
  unit,
}: {
  drivers: PublicDriver[];
  hrefFor: (driver: PublicDriver) => string;
  unit?: DriverUnit | "";
}): JSX.Element {
  return (
    <div className="cral-hire-grid">
      {drivers.map((d, i) => {
        const lead = leadUnit(d, unit);
        const others = UNITS.filter((u) => u !== lead && d.rates[u]);
        return (
          <Link
            key={d.id}
            to={hrefFor(d)}
            style={{
              display: "flex",
              flexDirection: "column",
              background: "#FFFFFF",
              border: `1px solid ${color.neutral[200]}`,
              borderRadius: 12,
              overflow: "hidden",
              textDecoration: "none",
              minWidth: 0,
            }}
          >
            <div style={{ position: "relative", height: 150, background: CARD_TINTS[i % CARD_TINTS.length] }}>
              <DriverPhoto name={d.display_name} photoUrl={d.photo_url} fill />
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
                {d.county}
              </span>
            </div>
            <div style={{ padding: "14px 15px 15px", display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ font: `600 14.5px/1.35 ${font.sans}`, color: color.ink, marginBottom: 6 }}>{d.display_name}</div>
              <div style={{ font: `400 12.5px/1.5 ${font.sans}`, color: color.neutral[600], marginBottom: 12 }}>
                Driver · drives for {d.merchant_name}
              </div>
              <div
                style={{
                  marginTop: "auto",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  gap: 10,
                  paddingTop: 11,
                  borderTop: `1px solid ${color.neutral[100]}`,
                }}
              >
                {lead && (
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      font: `700 16px/1.2 ${font.display}`,
                      fontVariationSettings: "'wdth' 106",
                      color: color.ink,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatMoney(d.rates[lead]!)}
                    <span style={{ font: `400 11.5px/1 ${font.sans}`, color: color.neutral[500] }}> / {UNIT_WORD[lead]}</span>
                  </span>
                )}
                {others.length > 0 && (
                  <span style={{ font: `500 11.5px/1.4 ${font.sans}`, color: color.neutral[600], textAlign: "right" }}>
                    also by the {others.map((u) => UNIT_WORD[u]).join(" or ")}
                  </span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

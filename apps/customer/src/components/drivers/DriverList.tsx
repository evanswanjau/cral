import { Link } from "react-router-dom";
import { rateLine, type PublicDriver } from "../../lib/drivers-api.js";
import { Section, bodyText } from "../subsite/Section.js";

/**
 * The drivers taking bookings, as cards that open the public profile at
 * `/drivers/:id` (UI3). Moved out of `Drivers.tsx`; same card as before.
 * Shows only the public projection: first name and surname initial,
 * county, rates and who they drive for - never an ID, KRA PIN, licence
 * number or phone (docs/decisions/drivers.md).
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md section 4.3.
 */
export function DriverList({
  drivers,
  isLoading,
  failed,
  county,
}: {
  drivers: PublicDriver[];
  isLoading: boolean;
  failed: boolean;
  county: string;
}): JSX.Element {
  return (
    <Section id="drivers" overline="DRIVERS TAKING BOOKINGS" heading={county ? `Drivers in ${county}` : "Drivers across Kenya"}>
      {isLoading && <p style={bodyText}>Loading drivers…</p>}
      {failed && <p style={bodyText}>Couldn't load drivers. Try again in a moment.</p>}
      {!isLoading && !failed && drivers.length === 0 && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: 12, padding: 18 }}>
          <p style={bodyText}>
            No drivers are taking bookings here yet. Check back soon, or{" "}
            <Link to="/hire?type=cars" style={{ color: "#0F23A8", fontWeight: 600 }}>
              hire a car that comes with a driver
            </Link>
            .
          </p>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,340px),1fr))", gap: 12 }}>
        {drivers.map((d) => (
          <Link
            key={d.id}
            to={`/drivers/${d.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
              padding: "16px 18px",
              background: "#FFFFFF",
              border: "1px solid #E4E7EC",
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
                color: "#0F23A8",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                font: "700 16px/1 Archivo,sans-serif",
                flex: "none",
              }}
            >
              {d.display_name.charAt(0)}
            </span>
            <span style={{ flex: "1 1 160px", minWidth: 0 }}>
              <span style={{ display: "block", font: "600 16px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
                {d.display_name}
              </span>
              <span style={{ display: "block", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                {d.county} · drives for {d.merchant_name}
              </span>
            </span>
            <span style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>{rateLine(d)}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

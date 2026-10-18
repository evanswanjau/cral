import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { PageHero, Section, Card, Body } from "../components/site/marketing.js";
import { listDrivers, rateLine } from "../lib/drivers-api.js";

/**
 * Hire a driver (owner's call, 2026-10-18 - docs/plans/drivers.md): a
 * driver for your own car. Not pulled from a canvas file - no driver
 * screen exists in any design bundle - so it is built in the same
 * confirmed-token idiom as Towing.tsx and the marketing pages.
 *
 * Every driver here is checked by CRAL (licence, ID, KRA PIN) and drives
 * for an approved merchant. A driver with one of the merchant's own cars
 * is booked from that car's page instead.
 */
export function Drivers(): JSX.Element {
  useSeo({
    title: "Hire a driver",
    description: "A checked driver for your own car - by the day, the hour or the trip.",
    path: "/drivers",
  });
  const [county, setCounty] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["catalog", "drivers"], queryFn: () => listDrivers() });

  const counties = [...new Set((data?.data ?? []).map((d) => d.county))].sort();
  const shown = (data?.data ?? []).filter((d) => !county || d.county === county);

  return (
    <div>
      <PageHero
        kicker="HIRE A DRIVER"
        title="A driver for your own car."
        sub="Every driver is checked by CRAL - licence, ID and KRA PIN - and drives for an approved owner. Book by the day, the hour or the trip, and pay by M-Pesa once they accept."
      />
      <Section>
        {counties.length > 1 && (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
            {["", ...counties].map((c) => (
              <button
                key={c || "all"}
                type="button"
                onClick={() => setCounty(c)}
                style={{
                  height: 34,
                  padding: "0 13px",
                  borderRadius: 999,
                  border: `1px solid ${county === c ? "#0B0F1A" : "#E4E7EC"}`,
                  background: county === c ? "#0B0F1A" : "#FFFFFF",
                  color: county === c ? "#FFFFFF" : "#333B4A",
                  font: "600 13px/1 'Instrument Sans',sans-serif",
                  cursor: "pointer",
                }}
              >
                {c || "All counties"}
              </button>
            ))}
          </div>
        )}

        {isLoading && <Body>Loading drivers…</Body>}
        {error && <Body>Couldn't load drivers. Try again in a moment.</Body>}
        {data && shown.length === 0 && (
          <Card>
            <Body>No drivers are taking bookings here yet. Check back soon, or hire a car with a driver from Browse.</Body>
          </Card>
        )}

        {shown.map((d) => (
          <Link key={d.id} to={`/drivers/${d.id}`} style={{ textDecoration: "none", display: "block" }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span
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
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ font: "600 16px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>{d.display_name}</div>
                  <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                    {d.county} · drives for {d.merchant_name}
                  </div>
                </div>
                <div style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", textAlign: "right" }}>{rateLine(d)}</div>
              </div>
            </Card>
          </Link>
        ))}
      </Section>
    </div>
  );
}

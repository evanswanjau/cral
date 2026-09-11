import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "../lib/use-page-title.js";
import { listMyBookings, type BookingStatus } from "../lib/bookings-api.js";
import { formatMoney } from "../lib/catalog-api.js";

/**
 * `/trips` - a renter's own bookings. List only; the design's trip detail
 * (with the handover code) is `Cruz Customer Portal.dc.html`, not yet
 * pulled - see docs/plans/customer-portal.md's C8. `/trips/:id` here
 * renders what `GET /bookings/{id}` already returns honestly, without
 * pretending to have the handover step built.
 */

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "on_hire", label: "On hire" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

function statusChip(status: BookingStatus): { label: string; bg: string; fg: string; border: string } {
  switch (status) {
    case "requested":
      return { label: "WAITING ON OWNER", bg: "#FFF3DB", fg: "#8A5200", border: "#F5D9A3" };
    case "confirmed":
      return { label: "CONFIRMED", bg: "#E1F1FA", fg: "#075D93", border: "#A9D6EE" };
    case "active":
      return { label: "ON HIRE", bg: "#DDF3E9", fg: "#076945", border: "#A8DEC7" };
    case "completed":
      return { label: "COMPLETED", bg: "#F1F3F6", fg: "#5A6373", border: "#E4E7EC" };
    case "declined":
      return { label: "DECLINED", bg: "#FDE7EA", fg: "#A50E22", border: "#F7BDC5" };
    case "expired":
      return { label: "EXPIRED", bg: "#F1F3F6", fg: "#5A6373", border: "#E4E7EC" };
    case "cancelled":
      return { label: "CANCELLED", bg: "#F1F3F6", fg: "#5A6373", border: "#E4E7EC" };
  }
}

export function Trips(): JSX.Element {
  usePageTitle("My trips");
  const [filter, setFilter] = useState("all");
  const { data, isLoading } = useQuery({
    queryKey: ["bookings", "mine", filter],
    queryFn: () => listMyBookings({ filter }),
  });

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "clamp(28px,4vw,44px) 20px clamp(50px,7vw,80px)" }}>
      <h1
        style={{
          margin: "0 0 18px",
          font: "700 clamp(26px,3.4vw,34px)/1.12 Archivo,sans-serif",
          fontVariationSettings: "'wdth' 108",
          letterSpacing: "-.026em",
          color: "#0B0F1A",
        }}
      >
        My trips
      </h1>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 20 }}>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          const count = data?.counts[f.key];
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                height: 34,
                padding: "0 13px",
                background: on ? "#0B0F1A" : "#FFFFFF",
                color: on ? "#FFFFFF" : "#333B4A",
                border: `1px solid ${on ? "#0B0F1A" : "#E4E7EC"}`,
                borderRadius: 999,
                font: "600 13px/1 'Instrument Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              {f.label}
              {count !== undefined && count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      {isLoading && <p style={{ font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>Loading…</p>}

      {!isLoading && (data?.data.length ?? 0) === 0 && (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px dashed #CDD2DA",
            borderRadius: 12,
            padding: "40px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ font: "600 16px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 8 }}>
            No trips yet.
          </div>
          <Link
            to="/browse"
            style={{
              display: "inline-flex",
              height: 42,
              padding: "0 18px",
              alignItems: "center",
              background: "#0F23A8",
              color: "#FFFFFF",
              borderRadius: 8,
              font: "600 14px/1 'Instrument Sans',sans-serif",
              textDecoration: "none",
            }}
          >
            Find a car
          </Link>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {data?.data.map((b) => {
          const chip = statusChip(b.status);
          return (
            <Link
              key={b.id}
              to={`/trips/${b.id}`}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "center",
                padding: "16px 18px",
                background: "#FFFFFF",
                border: "1px solid #E4E7EC",
                borderRadius: 12,
                textDecoration: "none",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ font: "600 15px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 3 }}>
                  {b.vehicle.make} {b.vehicle.model} {b.vehicle.year}
                </div>
                <div style={{ font: "400 12.5px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                  {b.ref} · {new Date(b.pickup_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} -{" "}
                  {new Date(b.dropoff_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </div>
              </div>
              <span
                style={{
                  padding: "5px 11px",
                  background: chip.bg,
                  color: chip.fg,
                  border: `1px solid ${chip.border}`,
                  borderRadius: 999,
                  font: "600 10.5px/1.4 'IBM Plex Mono',monospace",
                  letterSpacing: ".05em",
                }}
              >
                {chip.label}
              </span>
              <span style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
                {formatMoney(b.gross)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "../lib/use-page-title.js";
import { cancelMyBooking, getMyBooking } from "../lib/bookings-api.js";
import { formatMoney } from "../lib/catalog-api.js";
import { ApiClientError } from "../lib/api.js";

/**
 * `/trips/:id`. Renders exactly what `GET /bookings/{id}` returns - no
 * handover code (that screen belongs to the Customer Portal canvas, C8,
 * not pulled yet) and no deposit line (there is none, owner's call
 * 2026-09-11).
 */
export function TripDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: booking, isLoading } = useQuery({
    queryKey: ["bookings", id],
    queryFn: () => getMyBooking(id!),
    enabled: !!id,
    retry: false,
  });

  usePageTitle(booking ? booking.ref : "Trip");

  if (isLoading || !booking) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "60px 24px" }}>
        <p style={{ font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>Loading…</p>
      </div>
    );
  }

  const canCancel = booking.status === "requested" || booking.status === "confirmed";

  const cancel = async () => {
    setError(null);
    setCancelling(true);
    try {
      await cancelMyBooking(booking.id);
      await queryClient.invalidateQueries({ queryKey: ["bookings", id] });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Couldn't cancel that. Try again.");
    } finally {
      setCancelling(false);
    }
  };

  const card = {
    background: "#FFFFFF",
    border: "1px solid #E4E7EC",
    borderRadius: 12,
    padding: "clamp(18px,2.4vw,24px)",
  } as const;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(28px,4vw,44px) 20px clamp(50px,7vw,80px)" }}>
      <button
        type="button"
        onClick={() => navigate("/trips")}
        style={{
          height: 34,
          padding: "0 12px 0 8px",
          background: "none",
          border: "none",
          font: "600 13px/1 'Instrument Sans',sans-serif",
          color: "#5A6373",
          cursor: "pointer",
          marginBottom: 14,
        }}
      >
        ← My trips
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h1
          style={{
            margin: 0,
            font: "700 clamp(24px,3vw,30px)/1.15 Archivo,sans-serif",
            fontVariationSettings: "'wdth' 108",
            color: "#0B0F1A",
          }}
        >
          {booking.vehicle.make} {booking.vehicle.model} {booking.vehicle.year}
        </h1>
        <span style={{ font: "500 13px/1 'IBM Plex Mono',monospace", color: "#838C9B" }}>{booking.ref}</span>
      </div>
      <p style={{ margin: "0 0 22px", font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        {booking.vehicle.owner_display_name}
      </p>

      <div style={{ ...card, marginBottom: 16, display: "grid", gap: 9 }}>
        <Row label="Status" value={booking.status.replace(/_/g, " ")} />
        <Row
          label="Pickup"
          value={new Date(booking.pickup_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        />
        <Row
          label="Return"
          value={new Date(booking.dropoff_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        />
        <Row label="Location" value={booking.pickup_location} />
        {booking.note_from_hirer && <Row label="Your note" value={booking.note_from_hirer} />}
        <div style={{ borderTop: "1px solid #F1F3F6", paddingTop: 9 }}>
          <Row bold label="Total" value={formatMoney(booking.total_due)} />
        </div>
      </div>

      {booking.status === "declined" && booking.decline_reason_code && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 4 }}>
            The owner declined
          </div>
          <p style={{ margin: 0, font: "400 13.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            {booking.decline_reason_code.replace(/_/g, " ")}
          </p>
        </div>
      )}

      {booking.cancel_reason && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 4 }}>
            Cancelled
          </div>
          <p style={{ margin: 0, font: "400 13.5px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            {booking.cancel_reason}
          </p>
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            background: "#FDE7EA",
            border: "1px solid #F7BDC5",
            borderRadius: 8,
            font: "500 13px/1.5 'Instrument Sans',sans-serif",
            color: "#A50E22",
          }}
        >
          {error}
        </div>
      )}

      {canCancel && (
        <button
          type="button"
          onClick={cancel}
          disabled={cancelling}
          style={{
            height: 44,
            padding: "0 18px",
            background: "#FFFFFF",
            color: "#A50E22",
            border: "1px solid #F7BDC5",
            borderRadius: 8,
            font: "600 14px/1 'Instrument Sans',sans-serif",
            cursor: cancelling ? "default" : "pointer",
            opacity: cancelling ? 0.6 : 1,
          }}
        >
          {cancelling
            ? "Cancelling…"
            : booking.status === "requested"
              ? "Withdraw request"
              : "Cancel booking"}
        </button>
      )}

      {!canCancel && (
        <Link to="/browse" style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0F23A8" }}>
          Find another car →
        </Link>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span
        style={{
          font: bold ? "600 14px/1.4 'Instrument Sans',sans-serif" : "400 13.5px/1.4 'Instrument Sans',sans-serif",
          color: bold ? "#0B0F1A" : "#5A6373",
        }}
      >
        {label}
      </span>
      <span
        style={{
          font: bold ? "700 15px/1.4 Archivo,sans-serif" : "500 13.5px/1.4 'Instrument Sans',sans-serif",
          color: "#0B0F1A",
          textAlign: "right",
          maxWidth: "60%",
        }}
      >
        {value}
      </span>
    </div>
  );
}

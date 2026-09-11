import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "../lib/use-page-title.js";
import { getCatalogVehicle, formatMoney } from "../lib/catalog-api.js";
import { createBooking, type BookingDetail } from "../lib/bookings-api.js";
import { ApiClientError } from "../lib/api.js";

/**
 * `/book/:id`, reproduced from the design's "booking" screen, stages 1-2
 * only (review -> waiting). Payment (stages 3-5) is C6/C7 and depends on
 * decisions not yet made about the Co-op rail.
 *
 * "Send request, pay nothing yet" is not just copy here - POST /bookings
 * genuinely charges nothing (spec: no deposit for now, owner's call
 * 2026-09-11). The money shown is exactly what the server will store.
 */

function daysBetween(from: string, to: string): number {
  return Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));
}

function Countdown({ dueAt }: { dueAt: string }): JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remainingMs = Math.max(0, new Date(dueAt).getTime() - now);
  const h = Math.floor(remainingMs / 3_600_000);
  const m = Math.floor((remainingMs % 3_600_000) / 60_000);
  const s = Math.floor((remainingMs % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}

export function Booking(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [booking, setBooking] = useState<BookingDetail | null>(null);

  const { data: car, isLoading } = useQuery({
    queryKey: ["catalog", "vehicle", id],
    queryFn: () => getCatalogVehicle(id!),
    enabled: !!id,
    retry: false,
  });

  usePageTitle(car ? `Book ${car.make} ${car.model}` : "Book a car");

  useEffect(() => {
    if (!isLoading && (!from || !to) && id) {
      navigate(`/cars/${id}`, { replace: true });
    }
  }, [isLoading, from, to, id, navigate]);

  if (isLoading || !car || !from || !to) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "60px 24px" }}>
        <p style={{ font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>Loading…</p>
      </div>
    );
  }

  const name = `${car.make} ${car.model} ${car.year}`;
  const days = daysBetween(from, to);
  const total = car.daily_rate.amount * days;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const pickup = new Date(`${from}T10:00:00`).toISOString();
      const dropoff = new Date(`${to}T10:00:00`).toISOString();
      const result = await createBooking({
        vehicle_id: car.id,
        pickup_at: pickup,
        dropoff_at: dropoff,
        ...(note ? { note_from_hirer: note } : {}),
      });
      setBooking(result);
    } catch (e) {
      if (e instanceof ApiClientError) {
        setError({ code: e.code, message: e.message });
      } else {
        setError({ code: "unknown", message: "Something went wrong. Try again." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const card = {
    background: "#FFFFFF",
    border: "1px solid #E4E7EC",
    borderRadius: 12,
    padding: "clamp(18px,2.4vw,24px)",
  } as const;

  // ---- waiting stage ----
  if (booking) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(28px,4vw,44px) 20px clamp(50px,7vw,80px)" }}>
        <div style={{ ...card, textAlign: "center" }}>
          <div
            style={{
              font: "500 10px/1 'IBM Plex Mono',monospace",
              letterSpacing: ".11em",
              color: "#838C9B",
              marginBottom: 10,
            }}
          >
            {booking.ref}
          </div>
          <h1
            style={{
              margin: "0 0 10px",
              font: "700 clamp(22px,2.8vw,28px)/1.15 Archivo,sans-serif",
              fontVariationSettings: "'wdth' 108",
              color: "#0B0F1A",
            }}
          >
            Request sent. The clock is on the owner now.
          </h1>
          <p style={{ margin: "0 0 22px", font: "400 15px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            {car.owner.display_name} has twelve hours to accept.
          </p>
          {booking.response_due_at && (
            <div
              style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "14px 26px",
                background: "#F8F9FB",
                borderRadius: 12,
                marginBottom: 22,
              }}
            >
              <span style={{ font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#9AA2B0" }}>
                REQUEST LAPSES IN
              </span>
              <span style={{ font: "700 26px/1 Archivo,sans-serif", fontVariationSettings: "'wdth' 108", color: "#0B0F1A" }}>
                <Countdown dueAt={booking.response_due_at} />
              </span>
            </div>
          )}
          <p style={{ margin: "0 0 22px", font: "400 13.5px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            No money moves yet. We'll email you either way - you don't have to sit on this page.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              to="/browse"
              style={{
                height: 44,
                padding: "0 19px",
                display: "inline-flex",
                alignItems: "center",
                background: "#FFFFFF",
                color: "#0B0F1A",
                border: "1px solid #CDD2DA",
                borderRadius: 8,
                font: "600 14px/1 'Instrument Sans',sans-serif",
                textDecoration: "none",
              }}
            >
              Keep browsing
            </Link>
            <Link
              to="/trips"
              style={{
                height: 44,
                padding: "0 19px",
                display: "inline-flex",
                alignItems: "center",
                background: "#0F23A8",
                color: "#FFFFFF",
                borderRadius: 8,
                font: "600 14px/1 'Instrument Sans',sans-serif",
                textDecoration: "none",
              }}
            >
              View my trips
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---- review stage ----
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(28px,4vw,44px) 20px clamp(50px,7vw,80px)" }}>
      <h1
        style={{
          margin: "0 0 6px",
          font: "700 clamp(24px,3vw,30px)/1.15 Archivo,sans-serif",
          fontVariationSettings: "'wdth' 108",
          letterSpacing: "-.025em",
          color: "#0B0F1A",
        }}
      >
        Check this, then send it to {car.owner.display_name}.
      </h1>
      <p style={{ margin: "0 0 22px", font: "400 14.5px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        Nothing is charged at this step. If the owner declines or goes quiet for twelve hours, the
        request lapses and you have paid nothing.
      </p>

      <div style={{ ...card, marginBottom: 16, display: "flex", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ font: "600 16px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 4 }}>
            {name}
          </div>
          <div style={{ font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
            {car.registration} · {car.county ?? "Location on request"}
          </div>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "grid", gap: 9 }}>
          <Row label="Pickup" value={new Date(from).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} />
          <Row label="Return" value={new Date(to).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} />
          <Row label={`${days} day${days > 1 ? "s" : ""} × ${formatMoney(car.daily_rate)}`} value={formatMoney({ amount: total, currency: car.daily_rate.currency })} />
          <Row label="CRAL booking fee" value="KES 0" />
          <div style={{ borderTop: "1px solid #F1F3F6", paddingTop: 9 }}>
            <Row bold label="Total" value={formatMoney({ amount: total, currency: car.daily_rate.currency })} />
          </div>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 22 }}>
        <label style={{ display: "block" }}>
          <span style={{ display: "block", font: "600 13px/1 'Instrument Sans',sans-serif", color: "#333B4A", marginBottom: 9 }}>
            Anything {car.owner.display_name} should know
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Optional"
            style={{
              width: "100%",
              padding: 11,
              border: "1px solid #CDD2DA",
              borderRadius: 8,
              font: "400 14px/1.5 'Instrument Sans',sans-serif",
              color: "#0B0F1A",
              resize: "vertical",
            }}
          />
        </label>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "13px 15px",
            background: "#FDE7EA",
            border: "1px solid #F7BDC5",
            borderRadius: 8,
            font: "500 13.5px/1.5 'Instrument Sans',sans-serif",
            color: "#A50E22",
          }}
        >
          {error.message}
          {error.code === "documents_required" && (
            <>
              {" "}
              <Link to="/documents" style={{ color: "#A50E22", textDecoration: "underline" }}>
                Add them now →
              </Link>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        style={{
          width: "100%",
          height: 50,
          background: "#0F23A8",
          color: "#FFFFFF",
          border: "none",
          borderRadius: 8,
          font: "600 16px/1 'Instrument Sans',sans-serif",
          cursor: submitting ? "default" : "pointer",
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? "Sending…" : "Send request, pay nothing yet"}
      </button>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
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
          font: bold
            ? "700 15px/1.4 Archivo,sans-serif"
            : "500 13.5px/1.4 'Instrument Sans',sans-serif",
          fontVariationSettings: bold ? "'wdth' 106" : undefined,
          color: "#0B0F1A",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

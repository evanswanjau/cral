import type { CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchBookingDetail } from "../lib/bookings-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

function money(m: { amount: number; currency: string }): string {
  return `${m.currency} ${Math.round(m.amount / 100).toLocaleString("en-KE")}`;
}

const PAYMENT_LABEL: Record<string, string> = {
  none: "No payment rail used for this booking",
  pending: "STK prompt sent, awaiting the M-Pesa result",
  success: "Paid",
  failed: "Payment failed",
  cancelled: "Payment cancelled",
};

export function BookingDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: b, isLoading, error } = useQuery({
    queryKey: ["admin", "bookings", id],
    queryFn: () => fetchBookingDetail(id!),
    enabled: !!id,
  });

  usePageTitle(b ? b.ref : "Booking");

  if (isLoading) return <div style={S.empty}>Loading…</div>;
  if (error || !b) return <div style={S.empty}>Couldn't load that booking.</div>;

  return (
    <div>
      <button type="button" onClick={() => navigate("/bookings")} style={S.backBtn}>
        ← All bookings
      </button>

      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>{b.ref}</h1>
          <p style={S.lede}>{b.vehicle_label}</p>
        </div>
      </div>

      <div style={S.panel}>
        <Row label="Status" value={b.status.replace(/_/g, " ")} />
        <Row label="Renter" value={`${b.hirer_name} · ${b.hirer_email}`} />
        <Row label="Renter ID verified" value={b.hirer_id_verified ? "Yes - both documents accepted" : "Not yet"} />
        <Row label="Owner" value={b.merchant_name} />
        <Row
          label="Dates"
          value={`${new Date(b.pickup_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} → ${new Date(b.dropoff_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
        />
        <Row label="Pickup location" value={b.pickup_location} />
        {b.note_from_hirer && <Row label="Renter's note" value={b.note_from_hirer} />}
        <Row label="Gross" value={money(b.gross)} />
        <Row label="Commission" value={money(b.commission)} />
        <Row label="Owner nets" value={money(b.merchant_net)} />
        <Row label="Payment" value={PAYMENT_LABEL[b.payment_status] ?? b.payment_status} />
        {b.response_due_at && <Row label="Response due" value={new Date(b.response_due_at).toLocaleString("en-GB")} />}
        {b.decline_reason_code && <Row label="Decline reason" value={b.decline_reason_code.replace(/_/g, " ")} />}
        {b.cancel_reason && <Row label="Cancel reason" value={b.cancel_reason} />}
        {b.returned_at && <Row label="Returned" value={new Date(b.returned_at).toLocaleString("en-GB")} />}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={S.row}>
      <span style={S.rowLabel}>{label}</span>
      <span style={S.rowValue}>{value}</span>
    </div>
  );
}

const S = {
  backBtn: { height: 34, padding: "0 4px", background: "none", border: "none", font: "600 13px/1 'Instrument Sans',sans-serif", color: "#5A6373", cursor: "pointer", marginBottom: 10 },
  headRow: { marginBottom: 18 },
  h1: { margin: "0 0 4px", font: "600 clamp(23px,3vw,28px)/1.15 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.02em", color: "#1A1F2B" },
  lede: { margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  row: { display: "flex", justifyContent: "space-between", gap: 16, padding: "13px 18px", borderBottom: "1px solid #F1F3F6", flexWrap: "wrap" },
  rowLabel: { font: "500 12px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".04em", color: "#9AA2B0", flex: "none" },
  rowValue: { font: "500 14px/1.4 'Instrument Sans',sans-serif", color: "#1A1F2B", textAlign: "right", maxWidth: "70%" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;

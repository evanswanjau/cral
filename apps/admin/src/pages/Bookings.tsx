import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchBookings, type AdminBookingStatus, type AdminBookingSummary } from "../lib/bookings-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/** Read-only Ops visibility into bookings - "approving a vehicle does not
 * verify the business" applies here too: no decision lives on this
 * screen, cancel/refund/dispute are a later phase. */

const GRID = "120px minmax(0,1fr) minmax(0,1fr) 140px 110px 14px";

const STATUS: Record<AdminBookingStatus, { label: string; bg: string; border: string; fg: string }> = {
  requested: { label: "WAITING", bg: "#FFF3DB", border: "#F5D9A3", fg: "#8A5200" },
  confirmed: { label: "CONFIRMED", bg: "#E1F1FA", border: "#A9D6EE", fg: "#075D93" },
  active: { label: "ON HIRE", bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" },
  completed: { label: "COMPLETED", bg: "#F1F3F6", border: "#E4E7EC", fg: "#5A6373" },
  declined: { label: "DECLINED", bg: "#FDE7EA", border: "#F7BDC5", fg: "#A50E22" },
  expired: { label: "EXPIRED", bg: "#F1F3F6", border: "#E4E7EC", fg: "#9AA2B0" },
  cancelled: { label: "CANCELLED", bg: "#F1F3F6", border: "#E4E7EC", fg: "#9AA2B0" },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "requested", label: "Waiting" },
  { key: "confirmed", label: "Confirmed" },
  { key: "active", label: "On hire" },
  { key: "completed", label: "Completed" },
];

export function Bookings(): JSX.Element {
  usePageTitle("Bookings");
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "bookings", "list", status],
    queryFn: () => fetchBookings(status ? { status } : {}),
  });

  return (
    <div>
      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>Bookings</h1>
          <p style={S.lede}>
            Every hire request, newest first. This is visibility, not a decision path -
            cancellations, refunds and disputes aren't handled from here yet.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatus(f.key)}
            style={{
              ...S.filterBtn,
              background: status === f.key ? "#1A1F2B" : "#FFFFFF",
              color: status === f.key ? "#FFFFFF" : "#333B4A",
              borderColor: status === f.key ? "#1A1F2B" : "#E4E7EC",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={S.tableWrap}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 760 }}>
            <div style={{ ...S.rowGrid, ...S.tableHead }}>
              {["REF", "RENTER / OWNER", "CAR", "DATES", "STATUS", ""].map((h, i) => (
                <span key={i} style={S.th}>
                  {h}
                </span>
              ))}
            </div>

            {isLoading && <div style={S.empty}>Loading bookings…</div>}
            {error && <div style={S.empty}>Couldn't load bookings. Try again.</div>}
            {data && data.data.length === 0 && <div style={S.empty}>Nothing in this filter.</div>}

            {data?.data.map((b) => (
              <Row key={b.id} b={b} onOpen={() => navigate(`/bookings/${b.id}`)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ b, onOpen }: { b: AdminBookingSummary; onOpen: () => void }): JSX.Element {
  const s = STATUS[b.status];
  return (
    <div onClick={onOpen} style={{ ...S.rowGrid, ...S.row }}>
      <span style={{ font: "600 13px/1.3 'IBM Plex Mono',monospace", color: "#1A1F2B" }}>{b.ref}</span>
      <div style={{ minWidth: 0 }}>
        <div style={S.ellipsis}>{b.hirer_name}</div>
        <div style={{ ...S.ellipsis, color: "#9AA2B0" }}>{b.merchant_name}</div>
      </div>
      <span style={S.ellipsis}>{b.vehicle_label}</span>
      <span style={{ font: "400 12.5px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
        {new Date(b.pickup_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} -{" "}
        {new Date(b.dropoff_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
      </span>
      <span>
        <span style={{ ...S.badge, background: s.bg, borderColor: s.border, color: s.fg }}>{s.label}</span>
      </span>
      <span style={{ font: "400 16px/1 'Instrument Sans',sans-serif", color: "#CDD2DA" }}>›</span>
    </div>
  );
}

const S = {
  headRow: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 },
  h1: {
    margin: "0 0 7px",
    font: "600 clamp(25px,3.4vw,32px)/1.1 Archivo,sans-serif",
    fontVariationSettings: "'wdth' 106",
    letterSpacing: "-.022em",
    color: "#1A1F2B",
  },
  lede: { margin: 0, font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 620 },
  filterBtn: { height: 34, padding: "0 13px", border: "1px solid", borderRadius: 999, font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  tableWrap: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  rowGrid: { display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: "clamp(10px,1.4vw,16px)", padding: "14px 18px" },
  tableHead: { padding: "10px 18px", background: "#FFFFFF", borderBottom: "1px solid #E4E7EC" },
  th: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  row: { borderBottom: "1px solid #F1F3F6", cursor: "pointer" },
  badge: { display: "inline-flex", alignItems: "center", padding: "2px 9px", border: "1px solid", borderRadius: 999, font: "600 10px/1.5 'IBM Plex Mono',monospace", letterSpacing: ".05em" },
  ellipsis: { font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;

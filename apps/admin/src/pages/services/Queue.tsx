import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchServiceRequests, type ServiceRequestQueueRow, type ServiceRequestStatus } from "../../lib/services-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";

/**
 * The towing/recovery queue - the first offering under "Services" (owner's
 * call, 2026-09-23). CRAL-run dispatch, so there's no merchant here - a
 * request goes straight from a renter to Ops. Modeled on Renters.tsx's
 * list idiom (the simplest of the existing queues, no checklist).
 */

const REASON_LABEL: Record<string, string> = {
  mechanical_breakdown: "Mechanical breakdown",
  accident: "Accident",
};

const STATUS: Record<ServiceRequestStatus, { label: string; bg: string; border: string; fg: string }> = {
  requested: { label: "NEEDS A QUOTE", bg: "#FFF3DB", border: "#F5D9A3", fg: "#8A5200" },
  quoted: { label: "QUOTED", bg: "#EDEFFC", border: "#C3CBF5", fg: "#0F23A8" },
  accepted: { label: "ACCEPTED", bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" },
  declined: { label: "DECLINED", bg: "#FDE7EA", border: "#F7BDC5", fg: "#A50E22" },
  completed: { label: "COMPLETED", bg: "#F1F3F6", border: "#E4E7EC", fg: "#5A6373" },
  cancelled: { label: "CANCELLED", bg: "#F1F3F6", border: "#E4E7EC", fg: "#838C9B" },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "open", label: "Open" },
  { key: "requested", label: "Needs a quote" },
  { key: "quoted", label: "Quoted" },
  { key: "accepted", label: "Accepted" },
  { key: "all", label: "All" },
];

const GRID = "minmax(0,1fr) 160px 130px 14px";

export function Queue(): JSX.Element {
  usePageTitle("Services");
  const navigate = useNavigate();
  const [filter, setFilter] = useState("open");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "service-requests", "list", filter],
    queryFn: () => fetchServiceRequests({ status: filter }),
  });

  return (
    <div>
      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>Services</h1>
          <p style={S.lede}>
            Towing and recovery requests. Quote them per km, or note it's subject to discussion -
            the renter accepts before anything is dispatched.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{
              ...S.filterBtn,
              background: filter === f.key ? "#1A1F2B" : "#FFFFFF",
              color: filter === f.key ? "#FFFFFF" : "#333B4A",
              borderColor: filter === f.key ? "#1A1F2B" : "#E4E7EC",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={S.tableWrap}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 640 }}>
            <div style={{ ...S.rowGrid, ...S.tableHead }}>
              {["REQUEST", "FILED", "STATUS", ""].map((h, i) => (
                <span key={i} style={S.th}>
                  {h}
                </span>
              ))}
            </div>

            {isLoading && <div style={S.empty}>Loading requests…</div>}
            {error && <div style={S.empty}>Couldn't load the queue. Try again.</div>}
            {data && data.data.length === 0 && <div style={S.empty}>Nothing in this filter.</div>}

            {data?.data.map((r) => (
              <Row key={r.id} r={r} onOpen={() => navigate(`/services/${r.id}`)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ r, onOpen }: { r: ServiceRequestQueueRow; onOpen: () => void }): JSX.Element {
  const s = STATUS[r.status];
  return (
    <div onClick={onOpen} style={{ ...S.rowGrid, ...S.row }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B" }}>
          {REASON_LABEL[r.reason] ?? r.reason} · {r.pickup_location}
        </div>
        <div style={S.ellipsis}>
          {r.requester_name ?? r.requester_email}
        </div>
      </div>
      <span style={{ font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" }}>
        {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
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
  lede: { margin: 0, font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 600 },
  filterBtn: { height: 34, padding: "0 13px", border: "1px solid", borderRadius: 999, font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  tableWrap: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  rowGrid: { display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: "clamp(12px,1.6vw,20px)", padding: "15px 18px" },
  tableHead: { padding: "10px 18px", background: "#FFFFFF", borderBottom: "1px solid #E4E7EC" },
  th: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  row: { borderBottom: "1px solid #F1F3F6", cursor: "pointer" },
  badge: { display: "inline-flex", alignItems: "center", padding: "2px 9px", border: "1px solid", borderRadius: 999, font: "600 10px/1.5 'IBM Plex Mono',monospace", letterSpacing: ".05em" },
  ellipsis: { font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;

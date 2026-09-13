import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchRenters, type RenterQueueRow, type RenterQueueStatus } from "../lib/renters-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/** The renter document review queue - the real decision path the
 * documents_required booking gate and the pickup handover gate both key
 * off. Modeled on Merchants.tsx's list idiom. */

const GRID = "minmax(0,1fr) 190px 130px 14px";

const STATUS: Record<RenterQueueStatus, { label: string; bg: string; border: string; fg: string }> = {
  pending: { label: "PENDING", bg: "#FFF3DB", border: "#F5D9A3", fg: "#8A5200" },
  verified: { label: "VERIFIED", bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" },
  rejected: { label: "REJECTED", bg: "#FDE7EA", border: "#F7BDC5", fg: "#A50E22" },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
];

export function Renters(): JSX.Element {
  usePageTitle("Renters");
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "renters", "list", filter],
    queryFn: () => fetchRenters({ filter }),
  });

  return (
    <div>
      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>Renters</h1>
          <p style={S.lede}>
            Everyone who has uploaded an ID or licence. A renter can send a booking request the
            moment both are uploaded - only the pickup handover waits on you.
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
              {["RENTER", "UPLOADED", "STATUS", ""].map((h, i) => (
                <span key={i} style={S.th}>
                  {h}
                </span>
              ))}
            </div>

            {isLoading && <div style={S.empty}>Loading renters…</div>}
            {error && <div style={S.empty}>Couldn't load renters. Try again.</div>}
            {data && data.data.length === 0 && <div style={S.empty}>Nothing in this filter.</div>}

            {data?.data.map((r) => (
              <Row key={r.user_id} r={r} onOpen={() => navigate(`/renters/${r.user_id}`)} />
            ))}
          </div>
        </div>
        {data && (
          <div style={S.foot}>
            <span>
              {data.total} {data.total === 1 ? "RENTER" : "RENTERS"} · MOST WAITING FIRST
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ r, onOpen }: { r: RenterQueueRow; onOpen: () => void }): JSX.Element {
  const s = STATUS[r.status];
  return (
    <div onClick={onOpen} style={{ ...S.rowGrid, ...S.row }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B" }}>{r.name}</div>
        <div style={S.ellipsis}>{r.email}</div>
      </div>
      <span style={{ font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" }}>
        {new Date(r.uploaded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
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
  foot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 18px", background: "#FFFFFF", font: "400 12px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".04em", color: "#838C9B", flexWrap: "wrap" },
} satisfies Record<string, CSSProperties>;

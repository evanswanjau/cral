import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchDriverQueue, type DriverQueueFilter, type DriverQueueRow, type DriverStatus } from "../../lib/drivers-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";

/**
 * The driver review queue (owner's call, 2026-10-18 - docs/plans/drivers.md).
 * No canvas exists for drivers; built in the console's list idiom
 * (Renters.tsx), from the existing tokens.
 */

const GRID = "minmax(0,1.4fr) minmax(0,1fr) 90px 140px 14px";

export const DRIVER_STATUS: Record<DriverStatus, { label: string; bg: string; border: string; fg: string }> = {
  pending: { label: "NEEDS REVIEW", bg: "#FFF3DB", border: "#F5D9A3", fg: "#8A5200" },
  review: { label: "WITH A REVIEWER", bg: "#E1F1FA", border: "#A9D6EE", fg: "#075D93" },
  action: { label: "CHANGES SENT", bg: "#FDE7EA", border: "#F7BDC5", fg: "#A50E22" },
  rejected: { label: "REJECTED", bg: "#FDE7EA", border: "#F7BDC5", fg: "#A50E22" },
  live: { label: "APPROVED", bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" },
  paused: { label: "PAUSED", bg: "#F1F3F6", border: "#CDD2DA", fg: "#5A6373" },
};

const FILTERS: Array<{ key: DriverQueueFilter; label: string }> = [
  { key: "open", label: "To review" },
  { key: "changes_sent", label: "Changes sent" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export function Queue(): JSX.Element {
  usePageTitle("Drivers");
  const navigate = useNavigate();
  const [filter, setFilter] = useState<DriverQueueFilter>("open");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "drivers", "list", filter],
    queryFn: () => fetchDriverQueue(filter),
  });

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={S.h1}>Drivers</h1>
        <p style={S.lede}>
          Drivers merchants list for hire. Check the licence, national ID and KRA PIN, then approve. A
          driver can't be booked until their merchant's account is approved too.
        </p>
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
          <div style={{ minWidth: 680 }}>
            <div style={{ ...S.rowGrid, ...S.tableHead }}>
              {["DRIVER", "MERCHANT", "DOCS", "STATUS", ""].map((h, i) => (
                <span key={i} style={S.th}>{h}</span>
              ))}
            </div>
            {isLoading && <div style={S.empty}>Loading drivers…</div>}
            {error && <div style={S.empty}>Couldn't load drivers. Try again.</div>}
            {data && data.data.length === 0 && <div style={S.empty}>Nothing in this filter.</div>}
            {data?.data.map((d) => (
              <Row key={d.id} d={d} onOpen={() => navigate(`/drivers/${d.id}`)} />
            ))}
          </div>
        </div>
        {data && (
          <div style={S.foot}>
            {data.total} {data.total === 1 ? "DRIVER" : "DRIVERS"} · OLDEST FIRST
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ d, onOpen }: { d: DriverQueueRow; onOpen: () => void }): JSX.Element {
  const s = DRIVER_STATUS[d.status];
  return (
    <div onClick={onOpen} style={{ ...S.rowGrid, ...S.row }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B" }}>{d.full_name}</div>
        <div style={S.sub}>
          {d.county}
          {d.submitted_at ? ` · sent ${new Date(d.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
          {d.licence_expired ? " · licence expired" : ""}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={S.sub}>{d.merchant_name}</div>
        {!d.merchant_approved && <div style={{ ...S.sub, color: "#8A5200" }}>Account not approved</div>}
      </div>
      <span style={{ font: "500 12px/1 'IBM Plex Mono',monospace", color: d.docs_accepted === 3 ? "#076945" : "#5A6373" }}>{d.docs_accepted}/3</span>
      <span>
        <span style={{ ...S.badge, background: s.bg, borderColor: s.border, color: s.fg }}>{s.label}</span>
      </span>
      <span style={{ font: "400 16px/1 'Instrument Sans',sans-serif", color: "#CDD2DA" }}>›</span>
    </div>
  );
}

const S = {
  h1: { margin: "0 0 7px", font: "600 clamp(25px,3.4vw,32px)/1.1 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.022em", color: "#1A1F2B" },
  lede: { margin: 0, font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 620 },
  filterBtn: { height: 34, padding: "0 13px", border: "1px solid", borderRadius: 999, font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  tableWrap: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  rowGrid: { display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: "clamp(12px,1.6vw,20px)", padding: "15px 18px" },
  tableHead: { padding: "10px 18px", borderBottom: "1px solid #E4E7EC" },
  th: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  row: { borderBottom: "1px solid #F1F3F6", cursor: "pointer" },
  sub: { font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  badge: { display: "inline-flex", alignItems: "center", padding: "2px 9px", border: "1px solid", borderRadius: 999, font: "600 10px/1.5 'IBM Plex Mono',monospace", letterSpacing: ".05em" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  foot: { padding: "13px 18px", font: "400 12px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".04em", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;

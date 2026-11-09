import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchSaleQueue, kes, type SaleQueueFilter, type SaleQueueRow, type SaleStatus } from "../../lib/sales-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";

/**
 * The car-sale review queue (docs/plans/car-sales.md). No canvas exists
 * for sales; built in the console's list idiom (drivers/Queue.tsx), from
 * the existing tokens.
 */

const GRID = "minmax(0,1.5fr) minmax(0,1fr) 130px 150px 14px";

export const SALE_STATUS: Record<SaleStatus, { label: string; bg: string; border: string; fg: string }> = {
  pending: { label: "NEEDS REVIEW", bg: "#FFF3DB", border: "#F5D9A3", fg: "#8A5200" },
  review: { label: "WITH A REVIEWER", bg: "#E1F1FA", border: "#A9D6EE", fg: "#075D93" },
  action: { label: "CHANGES SENT", bg: "#FDE7EA", border: "#F7BDC5", fg: "#A50E22" },
  rejected: { label: "REJECTED", bg: "#FDE7EA", border: "#F7BDC5", fg: "#A50E22" },
  live: { label: "LISTED", bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" },
  paused: { label: "PAUSED", bg: "#F1F3F6", border: "#CDD2DA", fg: "#5A6373" },
  under_offer: { label: "UNDER OFFER", bg: "#EDEFFC", border: "#C3CBF5", fg: "#0F23A8" },
  sold: { label: "SOLD", bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" },
  withdrawn: { label: "WITHDRAWN", bg: "#F1F3F6", border: "#CDD2DA", fg: "#5A6373" },
  expired: { label: "EXPIRED", bg: "#FFF3DB", border: "#F5D9A3", fg: "#8A5200" },
  removed: { label: "TAKEN DOWN", bg: "#FDE7EA", border: "#F7BDC5", fg: "#A50E22" },
};

const FILTERS: Array<{ key: SaleQueueFilter; label: string }> = [
  { key: "open", label: "To review" },
  { key: "reported", label: "Reported" },
  { key: "changes_sent", label: "Changes sent" },
  { key: "listed", label: "Listed" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export function Queue(): JSX.Element {
  usePageTitle("Car sales");
  const navigate = useNavigate();
  const [filter, setFilter] = useState<SaleQueueFilter>("open");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "sales", "list", filter],
    queryFn: () => fetchSaleQueue(filter),
  });

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={S.h1}>Car sales</h1>
        <p style={S.lede}>
          Cars merchants and private sellers want to sell. Read the logbook against the photos and what the seller typed - names,
          plate and chassis have to agree before the advert goes live. CRAL holds no money on a sale.
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
          <div style={{ minWidth: 720 }}>
            <div style={{ ...S.rowGrid, ...S.tableHead }}>
              {["CAR", "SELLER", "ASKING", "STATUS", ""].map((h, i) => (
                <span key={i} style={S.th}>{h}</span>
              ))}
            </div>
            {isLoading && <div style={S.empty}>Loading listings…</div>}
            {error && <div style={S.empty}>Couldn't load listings. Try again.</div>}
            {data && data.data.length === 0 && <div style={S.empty}>Nothing in this filter.</div>}
            {data?.data.map((r) => (
              <Row key={r.id} r={r} onOpen={() => navigate(`/sales/${r.id}`)} />
            ))}
          </div>
        </div>
        {data && (
          <div style={S.foot}>
            {data.total} {data.total === 1 ? "LISTING" : "LISTINGS"} · {filter === "open" ? "OLDEST FIRST" : "NEWEST FIRST"}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ r, onOpen }: { r: SaleQueueRow; onOpen: () => void }): JSX.Element {
  const s = SALE_STATUS[r.status];
  return (
    <div onClick={onOpen} style={{ ...S.rowGrid, ...S.row }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B" }}>{r.title}</div>
        <div style={S.sub}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{r.registration}</span> · {r.county}
          {r.submitted_at ? ` · sent ${new Date(r.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={S.sub}>{r.seller_name || "(no name on file)"}</div>
        <div style={{ ...S.sub, color: "#838C9B" }}>{r.seller_type === "private" ? "Private seller" : "Merchant"}</div>
      </div>
      <span style={{ font: "500 12.5px/1 'IBM Plex Mono',monospace", color: "#1A1F2B" }}>{kes(r.asking_price)}</span>
      <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <span style={{ ...S.badge, background: s.bg, borderColor: s.border, color: s.fg }}>{s.label}</span>
        {r.open_reports > 0 && (
          <span style={{ ...S.badge, background: "#FDE7EA", borderColor: "#F7BDC5", color: "#A50E22" }}>
            {r.open_reports} {r.open_reports === 1 ? "REPORT" : "REPORTS"}
          </span>
        )}
      </span>
      <span style={{ font: "400 16px/1 'Instrument Sans',sans-serif", color: "#CDD2DA" }}>›</span>
    </div>
  );
}

const S = {
  h1: { margin: "0 0 7px", font: "600 clamp(25px,3.4vw,32px)/1.1 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.022em", color: "#1A1F2B" },
  lede: { margin: 0, font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 640 },
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

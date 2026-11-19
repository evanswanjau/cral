import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ORDER_STATUS,
  SERVICE_LABELS,
  fetchGarageOrders,
  money,
  type AdminGarageOrder,
  type GarageOrderStatus,
} from "../../lib/garage-orders-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";

/**
 * Garage jobs (Phase 4 GS4): the console for GS3's orders. The problem
 * queue comes first: a customer who raised a problem is waiting on Ops to
 * release the money to the garage or refund it. The other filters are for
 * looking a job up. Follows the `/services` towing queue idiom.
 *
 * `admin_support` and `admin_finance` (and `admin_super`), the roles the
 * `/admin/garage-orders` endpoints allow. Not from a canvas; built from
 * tokens.ts and pages/services/Queue.tsx.
 */

const FILTERS: Array<{ key: GarageOrderStatus | "all"; label: string }> = [
  { key: "problem", label: "Problems" },
  { key: "ready", label: "Ready" },
  { key: "in_progress", label: "In progress" },
  { key: "paid", label: "Paid, not started" },
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "completed", label: "Completed" },
  { key: "refunded", label: "Refunded" },
  { key: "all", label: "All" },
];

const GRID = "minmax(0,1fr) 140px 120px 190px 14px";

export function Queue(): JSX.Element {
  usePageTitle("Garage jobs");
  const navigate = useNavigate();
  const [filter, setFilter] = useState<GarageOrderStatus | "all">("problem");
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["admin", "garage-orders", "list", filter],
    queryFn: ({ pageParam }) => fetchGarageOrders(filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : null),
  });
  const rows = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div>
      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>Garage jobs</h1>
          <p style={S.lede}>
            Jobs customers paid CRAL for at a garage. A raised problem holds the money until you settle it here: release it
            to the garage, or refund the customer.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
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
              {["JOB", filter === "problem" ? "RAISED" : "OPENED", "PAID", "STATUS", ""].map((h, i) => (
                <span key={i} style={S.th}>
                  {h}
                </span>
              ))}
            </div>

            {isLoading && <div style={S.empty}>Loading jobs…</div>}
            {error && <div style={S.empty}>Couldn't load garage jobs. Try again.</div>}
            {data && rows.length === 0 && (
              <div style={S.empty}>{filter === "problem" ? "No problems waiting. Nothing to settle." : "Nothing in this filter."}</div>
            )}

            {rows.map((o) => (
              <Row key={o.id} o={o} showRaised={filter === "problem"} onOpen={() => navigate(`/garage-orders/${o.id}`)} />
            ))}
          </div>
        </div>
      </div>
      {hasNextPage && (
        <button type="button" style={{ ...S.filterBtn, height: 40, marginTop: 12, background: "#FFFFFF", borderColor: "#E4E7EC" }} disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });

function Row({ o, showRaised, onOpen }: { o: AdminGarageOrder; showRaised: boolean; onOpen: () => void }): JSX.Element {
  const s = ORDER_STATUS[o.status];
  const when = showRaised && o.problem_raised_at ? o.problem_raised_at : o.created_at;
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      style={{ ...S.rowGrid, ...S.row }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B" }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 500, fontSize: 13 }}>{o.ref}</span> ·{" "}
          {o.service_type ? (SERVICE_LABELS[o.service_type] ?? o.service_type) : "Garage job"}
        </div>
        <div style={S.ellipsis}>
          {o.outlet ? `${o.outlet.name}, ${o.outlet.county}` : "Garage"}
          {o.car ? ` · ${o.car.plate}` : ""}
          {o.customer_first_name ? ` · ${o.customer_first_name}` : ""}
        </div>
      </div>
      <span style={S.cell}>{fmtDate(when)}</span>
      <span style={S.cell}>{o.total.amount > 0 ? money(o.total) : "Nothing yet"}</span>
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
  lede: { margin: 0, font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: 640 },
  filterBtn: { height: 34, padding: "0 13px", border: "1px solid", borderRadius: 999, font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  tableWrap: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  rowGrid: { display: "grid", gridTemplateColumns: GRID, alignItems: "center", gap: "clamp(12px,1.6vw,20px)", padding: "15px 18px" },
  tableHead: { padding: "10px 18px", background: "#FFFFFF", borderBottom: "1px solid #E4E7EC" },
  th: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  row: { borderBottom: "1px solid #F1F3F6", cursor: "pointer" },
  cell: { font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" },
  badge: { display: "inline-flex", alignItems: "center", padding: "2px 9px", border: "1px solid", borderRadius: 999, font: "600 10px/1.5 'IBM Plex Mono',monospace", letterSpacing: ".05em" },
  ellipsis: { font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;

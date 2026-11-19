import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { SERVICE_LABELS, kesText } from "../lib/garage-api.js";
import { ORDER_STATUS, useGarageOrders, type OrderFilter } from "../lib/garage-orders-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * "Garage jobs" (Phase 4 GS3): accepted quotes, from payment to payout.
 * Not from a canvas; built from tokens.ts and GarageRequestList.
 */

const FILTERS: Array<{ key: OrderFilter; label: string }> = [
  { key: "active", label: "Active" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
}

export function GarageOrderList(): JSX.Element {
  usePageTitle("Garage jobs");
  const navigate = useNavigate();
  const [filter, setFilter] = useState<OrderFilter>("active");
  const { data, isPending } = useGarageOrders(filter);

  return (
    <div>
      <div style={P.listHead}>
        <div>
          <h1 style={P.h1}>Garage jobs</h1>
          <p style={P.lede}>
            Quotes customers accepted. Start once the customer has paid CRAL. You are paid in your next payout after they confirm the work.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{
              ...P.actionBtn,
              minHeight: 44,
              background: filter === f.key ? "#0B0F1A" : "#FFFFFF",
              color: filter === f.key ? "#FFFFFF" : "#1A1F2B",
              borderColor: filter === f.key ? "#0B0F1A" : "#CDD2DA",
            }}
          >
            {f.label}
            {f.key === "active" && data?.counts.to_start ? ` (${data.counts.to_start} to start)` : ""}
          </button>
        ))}
      </div>

      <div style={P.table}>
        {isPending || !data ? (
          <div style={{ ...P.emptyWrap, color: "#838C9B" }}>Loading…</div>
        ) : data.data.length === 0 ? (
          <div style={P.emptyWrap}>
            <div style={P.emptyTitle}>No jobs here</div>
            <p style={P.emptyBody}>A job appears when a customer accepts one of your quotes.</p>
          </div>
        ) : (
          data.data.map((o) => {
            const s = ORDER_STATUS[o.status];
            return (
              <div
                key={o.id}
                className="m-trow"
                style={{ ...P.row, gridTemplateColumns: "minmax(0,2fr) 130px 170px 70px 20px" }}
                onClick={() => navigate(`/garage/orders/${o.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={P.rowTitleWrap}>
                  <div style={P.rowTitleLine}>
                    <span style={P.rowTitle}>{o.car ? `${o.car.year} ${o.car.make} ${o.car.model}` : "A car"}</span>
                  </div>
                  <div style={P.rowMeta}>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{o.ref}</span>
                    {o.service_type ? ` · ${SERVICE_LABELS[o.service_type] ?? o.service_type}` : ""}
                    {o.outlet ? ` · ${o.outlet.name}` : ""}
                  </div>
                </div>
                <span style={{ ...P.rowMeta, marginTop: 0 }}>You keep {kesText(o.take_home)}</span>
                <span style={{ font: "600 13px/1.3 'Instrument Sans',sans-serif", color: s.color }}>{s.label}</span>
                <span style={P.dateLabel}>{fmtDate(o.created_at)}</span>
                <span style={P.chevron}>›</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

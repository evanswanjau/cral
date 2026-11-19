import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { kesText, requestTitle, useGarageRequests, type GarageFilter, type GarageRequest } from "../lib/garage-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * "Quote requests" (Phase 4 GS2): what customers asked this merchant's
 * garages to price. Not from a canvas; built from tokens.ts and the
 * portal's list idiom (PremisesList).
 */

const FILTERS: Array<{ key: GarageFilter; label: string }> = [
  { key: "to_quote", label: "To quote" },
  { key: "quoted", label: "Quoted" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
}

function statusWords(r: GarageRequest): { label: string; color: string } {
  if (r.declined) return { label: "You declined", color: "#5A6373" };
  if (r.status === "cancelled") return { label: "Closed by customer", color: "#5A6373" };
  if (r.status === "accepted") return { label: "Closed", color: "#5A6373" };
  if (r.my_quote?.status === "sent") return r.my_quote.expired ? { label: "Quote expired", color: "#A50E22" } : { label: "Quote sent", color: "#076945" };
  return { label: "Needs your price", color: "#8A5200" };
}

export function GarageRequestList(): JSX.Element {
  usePageTitle("Quote requests");
  const navigate = useNavigate();
  const [filter, setFilter] = useState<GarageFilter>("to_quote");
  const { data, isPending } = useGarageRequests(filter);

  return (
    <div>
      <div style={P.listHead}>
        <div>
          <h1 style={P.h1}>Quote requests</h1>
          <p style={P.lede}>
            Customers near your premises describe what their car needs, or the part they want for it. Send an itemised
            price: each part, each piece of labour and any delivery on its own line.
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
            {f.key === "to_quote" && data?.counts.to_quote ? ` (${data.counts.to_quote})` : ""}
          </button>
        ))}
      </div>

      <div style={P.table}>
        {isPending || !data ? (
          <div style={{ ...P.emptyWrap, color: "#838C9B" }}>Loading…</div>
        ) : data.data.length === 0 ? (
          <div style={P.emptyWrap}>
            <div style={P.emptyTitle}>Nothing here</div>
            <p style={P.emptyBody}>Requests reach approved garages that do the work, and approved parts shops, in the customer’s county.</p>
          </div>
        ) : (
          data.data.map((r) => {
            const s = statusWords(r);
            return (
              <div
                key={r.id}
                className="m-trow"
                style={{ ...P.row, gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) 150px 70px 20px" }}
                onClick={() => navigate(`/garage/requests/${r.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={P.rowTitleWrap}>
                  <div style={P.rowTitleLine}>
                    <span style={P.rowTitle}>{r.car ? `${r.car.year} ${r.car.make} ${r.car.model}` : "A car"}</span>
                  </div>
                  <div style={P.rowMeta}>
                    {requestTitle(r)} · {r.description}
                  </div>
                </div>
                <span style={{ ...P.rowMeta, marginTop: 0 }}>{r.outlet?.name ?? ""}</span>
                <span style={{ font: "600 13px/1.3 'Instrument Sans',sans-serif", color: s.color }}>
                  {s.label}
                  {r.my_quote?.status === "sent" ? ` · ${kesText(r.my_quote.total)}` : ""}
                </span>
                <span style={P.dateLabel}>{fmtDate(r.created_at)}</span>
                <span style={P.chevron}>›</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

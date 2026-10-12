import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchPayoutRuns, type PayoutRunItem } from "../../lib/payouts-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import { RUN_STATUS, dayText, destinationText, money } from "./status.js";

/**
 * Finance's payout queue (owner's call, 2026-10-11): runs are cut on each
 * merchant's schedule and wait here until someone presses Pay.
 *
 * Not pulled from a canvas file - the admin design bundle has no payouts
 * screen. Built in the console's existing idiom (Services' queue) and
 * tokens; flagged for a swap if a design arrives.
 */

const FILTERS: Array<{ key: string; label: string; count?: (c: Record<string, number>) => number }> = [
  { key: "open", label: "Needs action", count: (c) => (c.scheduled ?? 0) + (c.failed ?? 0) },
  { key: "processing", label: "Sending", count: (c) => c.processing ?? 0 },
  { key: "paid", label: "Paid" },
  { key: "all", label: "All" },
];

const GRID = "minmax(0,1.4fr) minmax(0,1fr) 120px 110px 14px";

export function Queue(): JSX.Element {
  usePageTitle("Payouts");
  const navigate = useNavigate();
  const [filter, setFilter] = useState("open");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "payout-runs", "list", filter],
    queryFn: () => fetchPayoutRuns(filter),
  });

  return (
    <div>
      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>Payouts</h1>
          <p style={S.lede}>
            Runs are cut on each merchant's payout day. Check one, then pay it - money only moves when you
            press Pay.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTERS.map((f) => {
          const n = data && f.count ? f.count(data.counts) : null;
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                ...S.filterBtn,
                background: on ? "#1A1F2B" : "#FFFFFF",
                color: on ? "#FFFFFF" : "#333B4A",
                borderColor: on ? "#1A1F2B" : "#E4E7EC",
              }}
            >
              {f.label}
              {n !== null && n > 0 ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>

      <div style={S.tableWrap}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 700 }}>
            <div style={{ ...S.rowGrid, ...S.tableHead }}>
              {["RUN", "PAYS TO", "AMOUNT", "STATUS", ""].map((h, i) => (
                <span key={i} style={S.th}>
                  {h}
                </span>
              ))}
            </div>

            {isLoading && <div style={S.empty}>Loading payout runs…</div>}
            {error && <div style={S.empty}>Couldn't load payout runs. Try again.</div>}
            {data && data.data.length === 0 && (
              <div style={S.empty}>{filter === "open" ? "Nothing waiting to be paid." : "Nothing in this filter."}</div>
            )}

            {data?.data.map((r) => (
              <Row key={r.id} r={r} onOpen={() => navigate(`/payouts/${r.id}`)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ r, onOpen }: { r: PayoutRunItem; onOpen: () => void }): JSX.Element {
  const s = RUN_STATUS[r.status];
  return (
    <div onClick={onOpen} style={{ ...S.rowGrid, ...S.row }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B" }}>{r.merchant.name}</div>
        <div style={S.ellipsis}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{r.ref}</span> · {dayText(r.run_date)} · {r.hires}{" "}
          {r.hires === 1 ? "hire" : "hires"}
        </div>
      </div>
      <span style={S.ellipsis}>{destinationText(r.destination)}</span>
      <span style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{money(r.net)}</span>
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

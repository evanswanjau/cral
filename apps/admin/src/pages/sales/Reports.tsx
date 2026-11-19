import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { REPORT_REASON_LABELS, fetchSaleReports, resolveSaleReport, type ReportFilter, type SaleReport } from "../../lib/sales-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import { S as Q, SALE_STATUS } from "./Queue.js";

/**
 * Reported sale listings (Phase 6 CS2 - docs/decisions/car-sales.md).
 * Buyers report a live listing; Ops dismisses the report, pauses the
 * listing (back to the merchant to fix and resubmit) or takes it down for
 * good. The merchant reads the note, never who reported. Not from a canvas;
 * built in the console's list idiom from the existing tokens.
 */

const FILTERS: Array<{ key: ReportFilter; label: string }> = [
  { key: "open", label: "Open" },
  { key: "handled", label: "Handled" },
  { key: "all", label: "All" },
];

type Action = "dismiss" | "pause" | "take_down";
const ACTION_LABEL: Record<Action, string> = { dismiss: "Dismiss", pause: "Pause listing", take_down: "Take down" };

export function Reports(): JSX.Element {
  usePageTitle("Reported listings");
  const [filter, setFilter] = useState<ReportFilter>("open");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "sales", "reports", filter],
    queryFn: () => fetchSaleReports(filter),
  });

  return (
    <div>
      <Link to="/sales" style={{ ...Q.link, display: "inline-block", marginBottom: 14 }}>← Car sales</Link>
      <div style={{ marginBottom: 20 }}>
        <h1 style={Q.h1}>Reported listings</h1>
        <p style={Q.lede}>
          Buyers' reports on live listings. Pausing sends the listing back to the merchant to fix and resubmit for
          review; taking it down ends it. Either closes every open report on that listing, and the merchant reads
          your note. They never see who reported.
        </p>
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{
              ...Q.filterBtn,
              background: filter === f.key ? "#1A1F2B" : "#FFFFFF",
              color: filter === f.key ? "#FFFFFF" : "#333B4A",
              borderColor: filter === f.key ? "#1A1F2B" : "#E4E7EC",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={Q.tableWrap}>
        {isLoading && <div style={Q.empty}>Loading reports…</div>}
        {error && <div style={Q.empty}>Couldn't load reports. Try again.</div>}
        {data && data.data.length === 0 && <div style={Q.empty}>Nothing in this filter.</div>}
        {data?.data.map((r) => <ReportRow key={r.id} r={r} />)}
        {data && (
          <div style={Q.foot}>
            {data.total} {data.total === 1 ? "REPORT" : "REPORTS"} · OLDEST FIRST
          </div>
        )}
      </div>
    </div>
  );
}

function ReportRow({ r }: { r: SaleReport }): JSX.Element {
  const qc = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: (v: { action: Action; note?: string }) => resolveSaleReport(r.id, v.action, v.note),
    onSuccess: () => {
      setAction(null);
      setErr(null);
      void qc.invalidateQueries({ queryKey: ["admin", "sales"] });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : "That didn't go through. Try again."),
  });
  const s = SALE_STATUS[r.listing.status];
  const needsNote = action === "pause" || action === "take_down";
  const listingOpen = r.listing.status === "live" || r.listing.status === "paused";

  return (
    <div style={{ padding: "15px 18px", borderBottom: "1px solid #F1F3F6" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <Link to={`/sales/${r.listing.id}`} style={{ font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B", textDecoration: "none" }}>
            {r.listing.title}
          </Link>
          <div style={Q.sub}>
            {r.listing.ref} · {r.listing.merchant_name} · reported{" "}
            {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            {r.reporter_name ? ` by ${r.reporter_name}` : ""}
          </div>
        </div>
        <span>
          <span style={{ ...Q.badge, background: s.bg, borderColor: s.border, color: s.fg }}>{s.label}</span>
        </span>
      </div>
      <div style={{ marginTop: 8, font: "600 13px/1.4 'Instrument Sans',sans-serif", color: "#A50E22" }}>{REPORT_REASON_LABELS[r.reason] ?? r.reason}</div>
      {r.details && <div style={{ ...Q.lede, fontSize: 13, marginTop: 2 }}>{r.details}</div>}

      {r.status !== "open" ? (
        <div style={{ ...Q.sub, marginTop: 8, whiteSpace: "normal" }}>
          {r.status === "dismissed" ? "Dismissed" : "Acted on"}
          {r.handled_by_name ? ` by ${r.handled_by_name}` : ""}
          {r.handled_note ? `: ${r.handled_note}` : ""}
        </div>
      ) : action ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={needsNote ? "What the merchant reads (required)" : "Internal note (optional)"}
            style={S.textarea}
            aria-label="Note"
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={mut.isPending || (needsNote && !note.trim())}
              style={{ ...S.btn, ...(action === "dismiss" ? {} : { color: "#D81E32", borderColor: "#F7BDC5" }) }}
              onClick={() => mut.mutate({ action, ...(note.trim() ? { note: note.trim() } : {}) })}
            >
              Confirm: {ACTION_LABEL[action]}
            </button>
            <button type="button" style={S.btn} onClick={() => setAction(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" style={S.btn} onClick={() => setAction("dismiss")}>Dismiss</button>
          {listingOpen && (
            <>
              <button type="button" style={S.btn} onClick={() => setAction("pause")}>Pause listing</button>
              <button type="button" style={{ ...S.btn, color: "#D81E32", borderColor: "#F7BDC5" }} onClick={() => setAction("take_down")}>
                Take down
              </button>
            </>
          )}
        </div>
      )}
      {err && <div style={{ ...Q.sub, color: "#A50E22", marginTop: 6, whiteSpace: "normal" }}>{err}</div>}
    </div>
  );
}

const S = {
  btn: { height: 32, padding: "0 12px", background: "#FFFFFF", color: "#0F23A8", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  textarea: { padding: 10, border: "1.5px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "400 13px/1.45 'Instrument Sans',sans-serif", color: "#1A1F2B", resize: "vertical" },
} satisfies Record<string, CSSProperties>;

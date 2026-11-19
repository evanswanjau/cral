import { useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ORDER_STATUS,
  SERVICE_LABELS,
  fetchGarageOrder,
  money,
  resolveGarageOrder,
  type AdminOrderQuote,
} from "../../lib/garage-orders-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";

/**
 * One garage job for Ops (Phase 4 GS4). Shows the customer's problem, the
 * quotes paid, the money (what the customer paid, CRAL's commission, what
 * the garage keeps) and the job's timeline. A `problem` job is settled
 * here through GS3's `POST /admin/garage-orders/:id/resolve`: release
 * (completed, paid in the garage's next run) or refund (every successful
 * payment sent back by M-Pesa). Both sides read the note, so it is
 * required. Follows pages/services/Case.tsx.
 *
 * Not from a canvas; built from tokens.ts and the towing case.
 */

const LINE_LABELS: Record<string, string> = { part: "PART", labour: "LABOUR", delivery: "DELIVERY", other: "OTHER" };

const QUOTE_STATE: Record<AdminOrderQuote["status"], string> = {
  sent: "Sent, waiting on the customer",
  accepted: "Accepted",
  declined: "Declined by the customer",
  withdrawn: "Withdrawn by the garage",
  superseded: "Not picked",
};

const CONFIRMED_BY: Record<string, string> = {
  customer: "the customer",
  auto: "automatically, 72 h after ready",
  ops: "Ops",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

export function Case(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: o, isLoading, error } = useQuery({
    queryKey: ["admin", "garage-orders", id],
    queryFn: () => fetchGarageOrder(id!),
    enabled: !!id,
  });
  usePageTitle(o ? `Garage job ${o.ref}` : "Garage job");

  const [outcome, setOutcome] = useState<"release" | "refund" | null>(null);
  const [note, setNote] = useState("");

  const resolveMut = useMutation({
    mutationFn: () => resolveGarageOrder(id!, { outcome: outcome!, note: note.trim() }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin", "garage-orders", id], updated);
      void queryClient.invalidateQueries({ queryKey: ["admin", "garage-orders", "list"] });
      setOutcome(null);
      setNote("");
    },
  });

  if (isLoading) return <div style={S.empty}>Loading…</div>;
  if (error || !o) return <div style={S.empty}>Couldn't load that job.</div>;

  const s = ORDER_STATUS[o.status];
  const paidQuotes = o.quotes.filter((q) => q.paid_at || q.status === "accepted" || q.status === "sent");
  const timeline: Array<[string, string | null]> = [
    ["Accepted the quote", o.created_at],
    ["Paid", o.paid_at],
    ["Garage started", o.started_at],
    ["Garage marked ready", o.ready_at],
    ["Problem raised", o.problem_raised_at],
    ["Settled by Ops", o.resolved_at],
    [o.confirmed_by ? `Completed, confirmed by ${CONFIRMED_BY[o.confirmed_by]}` : "Completed", o.completed_at],
    ["Cancelled by the customer", o.cancelled_at],
  ];

  return (
    <div>
      <button type="button" onClick={() => navigate("/garage-orders")} style={S.backBtn}>
        ← All garage jobs
      </button>

      <div style={S.headRow}>
        <div>
          <div style={S.mono}>{o.ref}</div>
          <h1 style={S.h1}>
            {o.service_type ? (SERVICE_LABELS[o.service_type] ?? o.service_type) : "Garage job"}
            {o.car ? ` · ${o.car.year} ${o.car.make} ${o.car.model}` : ""}
          </h1>
          <span style={{ ...S.badge, background: s.bg, borderColor: s.border, color: s.fg }}>{s.label}</span>
        </div>
      </div>

      {o.status === "problem" && (
        <div style={{ ...S.panel, borderColor: "#F7BDC5" }}>
          <div style={S.panelHead}>
            <span style={S.panelTitle}>The customer raised a problem</span>
            {o.problem_raised_at && <span style={S.mono}>{fmt(o.problem_raised_at).toUpperCase()}</span>}
          </div>
          <div style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
            <p style={S.body}>{o.problem_note}</p>
            <p style={{ ...S.body, color: "#5A6373" }}>
              The money stays with CRAL until you settle it. Speak to both sides first: the customer on{" "}
              {o.customer_phone ?? "the number on their account"}, the garage through its merchant file.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                aria-pressed={outcome === "release"}
                onClick={() => setOutcome("release")}
                style={{ ...S.btn, ...(outcome === "release" ? { background: "#0B8A5B", color: "#FFFFFF", borderColor: "#0B8A5B" } : {}) }}
              >
                Release to the garage
              </button>
              <button
                type="button"
                aria-pressed={outcome === "refund"}
                onClick={() => setOutcome("refund")}
                style={{ ...S.btn, ...(outcome === "refund" ? { background: "#D81E32", color: "#FFFFFF", borderColor: "#D81E32" } : { color: "#D81E32", borderColor: "#F7BDC5" }) }}
              >
                Refund the customer
              </button>
            </div>
            {outcome && (
              <div style={{ display: "grid", gap: 8 }}>
                <p style={{ ...S.body, fontWeight: 600 }}>
                  {outcome === "release"
                    ? `The job completes and the garage is paid ${money(o.merchant_net)} in its next payout run.`
                    : `Every payment on this job (${money(o.total)} in all) is sent back to the M-Pesa number it came from.`}
                </p>
                <label>
                  <span style={S.fieldLabel}>How it was settled. The customer and the garage both read this.</span>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} style={S.textarea} maxLength={2000} />
                </label>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" style={S.btn} onClick={() => { setOutcome(null); setNote(""); }}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={resolveMut.isPending || note.trim().length < 5}
                    onClick={() => resolveMut.mutate()}
                    style={{ ...S.btn, background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" }}
                  >
                    {resolveMut.isPending ? "Settling…" : outcome === "release" ? "Release the money" : "Send the refund"}
                  </button>
                </div>
              </div>
            )}
            {resolveMut.error && (
              <div role="alert" style={S.error}>
                {resolveMut.error instanceof Error ? resolveMut.error.message : "That didn't go through. Try again."}
              </div>
            )}
          </div>
        </div>
      )}

      {o.status !== "problem" && o.problem_note && (
        <div style={S.panel}>
          <div style={S.panelHead}>
            <span style={S.panelTitle}>Problem and how it was settled</span>
          </div>
          <div style={{ padding: "16px 18px", display: "grid", gap: 10 }}>
            <Line label="The customer said" value={o.problem_note} />
            {o.resolution_note && <Line label="Ops note" value={o.resolution_note} />}
          </div>
        </div>
      )}

      <div style={{ ...S.panel, marginTop: 16 }}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>The job</span>
        </div>
        <div style={{ padding: "16px 18px", display: "grid", gap: 10 }}>
          <Line label="Customer" value={`${o.customer_first_name ?? "Not given"} · ${o.customer_phone ?? "No phone on file"}`} />
          <Line label="Car" value={o.car ? `${o.car.year} ${o.car.make} ${o.car.model} · ${o.car.plate}` : "Not on file"} />
          <div>
            <div style={S.label}>GARAGE</div>
            <div style={S.body}>
              {o.outlet ? `${o.outlet.name}, ${o.outlet.address}, ${o.outlet.county}` : "Not on file"} ·{" "}
              <Link to={`/merchants/${o.merchant_id}`} style={{ color: "#0F23A8", fontWeight: 600 }}>
                Merchant file
              </Link>
            </div>
          </div>
          {o.description && <Line label="What the customer asked for" value={o.description} />}
        </div>
      </div>

      <div style={{ ...S.panel, marginTop: 16 }}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>Money</span>
        </div>
        <div style={{ padding: "16px 18px", display: "grid", gap: 10 }}>
          <Line label="Paid by the customer" value={money(o.total)} />
          <Line label="CRAL commission" value={money(o.commission)} />
          <Line label="Garage keeps" value={money(o.merchant_net)} />
          {o.amount_due && <Line label="Due now" value={money(o.amount_due)} />}
          {o.payment && (
            <Line
              label="Latest M-Pesa prompt"
              value={`${o.payment.status} · ${money(o.payment.amount)}${o.payment.receipt ? ` · ${o.payment.receipt}` : ""}${o.payment.failure_reason ? ` · ${o.payment.failure_reason}` : ""}`}
            />
          )}
        </div>
      </div>

      {paidQuotes.map((q) => (
        <div key={q.id} style={{ ...S.panel, marginTop: 16 }}>
          <div style={S.panelHead}>
            <span style={S.panelTitle}>{q.kind === "original" ? "The quote accepted" : "Extra work"}</span>
            <span style={S.mono}>{q.paid_at ? `PAID ${fmt(q.paid_at).toUpperCase()}` : QUOTE_STATE[q.status].toUpperCase()}</span>
          </div>
          <div style={{ padding: "8px 18px 16px" }}>
            {q.lines.map((l, i) => (
              <div key={i} style={S.line}>
                <span style={{ ...S.mono, width: 76, flex: "none" }}>{LINE_LABELS[l.kind] ?? l.kind.toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{l.description}</span>
                <span style={{ whiteSpace: "nowrap" }}>{money(l.amount)}</span>
              </div>
            ))}
            <div style={{ ...S.line, fontWeight: 700, borderBottom: "none" }}>
              <span style={{ flex: 1 }}>Total · {q.days_needed} {q.days_needed === 1 ? "day" : "days"}</span>
              <span>{money(q.total)}</span>
            </div>
            {q.commission && <div style={{ ...S.body, color: "#5A6373", fontSize: 13 }}>CRAL commission on this quote: {money(q.commission)}</div>}
          </div>
        </div>
      ))}

      <div style={{ ...S.panel, marginTop: 16 }}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>Timeline</span>
        </div>
        <div style={{ padding: "16px 18px", display: "grid", gap: 8 }}>
          {timeline
            .filter(([, at]) => !!at)
            .map(([label, at]) => (
              <div key={label} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span style={{ ...S.mono, width: 170, flex: "none" }}>{fmt(at!).toUpperCase()}</span>
                <span style={S.body}>{label}</span>
              </div>
            ))}
          {o.auto_confirm_at && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span style={{ ...S.mono, width: 170, flex: "none" }}>{fmt(o.auto_confirm_at).toUpperCase()}</span>
              <span style={{ ...S.body, color: "#5A6373" }}>Confirms itself if the customer says nothing</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div style={S.label}>{label.toUpperCase()}</div>
      <div style={S.body}>{value}</div>
    </div>
  );
}

const S = {
  backBtn: { height: 34, padding: "0 4px", background: "none", border: "none", font: "600 13px/1 'Instrument Sans',sans-serif", color: "#5A6373", cursor: "pointer", marginBottom: 10 },
  headRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 },
  h1: { margin: "4px 0 8px", font: "600 clamp(21px,2.8vw,26px)/1.2 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.02em", color: "#1A1F2B" },
  mono: { font: "500 10px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#838C9B" },
  label: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0", marginBottom: 3 },
  body: { margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#1A1F2B" },
  badge: { display: "inline-flex", alignItems: "center", padding: "2px 9px", border: "1px solid", borderRadius: 999, font: "600 10px/1.5 'IBM Plex Mono',monospace", letterSpacing: ".05em" },
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 18px", borderBottom: "1px solid #F1F3F6", flexWrap: "wrap" },
  panelTitle: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" },
  line: { display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid #F1F3F6", font: "400 14px/1.45 'Instrument Sans',sans-serif", color: "#1A1F2B", flexWrap: "wrap" },
  fieldLabel: { display: "block", marginBottom: 5, font: "600 11px/1.3 'Instrument Sans',sans-serif", color: "#5A6373" },
  textarea: { width: "100%", minHeight: 80, padding: 12, border: "1.5px solid #E4E7EC", borderRadius: "var(--r)", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#1A1F2B", background: "#FFFFFF", resize: "vertical", boxSizing: "border-box" },
  btn: { height: 40, padding: "0 16px", background: "#FFFFFF", color: "#1A1F2B", border: "1px solid #E4E7EC", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  error: { padding: "11px 14px", background: "#FDE7EA", border: "1px solid #F7BDC5", borderRadius: "var(--r)", font: "500 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;

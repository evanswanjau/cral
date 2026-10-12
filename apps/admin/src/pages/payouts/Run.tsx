import { useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPayoutRun, payPayoutRun, type PayoutAttempt } from "../../lib/payouts-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import { ATTEMPT_STATUS, CHANNEL_LABEL, RUN_STATUS, dayText, destinationText, money } from "./status.js";

/**
 * One payout run: what it pays for, where it goes, every attempt, and Pay.
 * Same footing as the queue - no canvas screen exists for this; console
 * idiom (Services' case screen) and tokens.
 */

export function Run(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: run, isLoading, error } = useQuery({
    queryKey: ["admin", "payout-runs", id],
    queryFn: () => fetchPayoutRun(id!),
    enabled: !!id,
    // While money is moving, keep the screen current without a reload.
    refetchInterval: (q) => (q.state.data?.status === "processing" ? 10_000 : false),
  });
  usePageTitle(run ? `${run.ref} · ${run.merchant.name}` : "Payout run");

  // One key per confirm: a double-click replays instead of paying twice.
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const payMut = useMutation({
    mutationFn: (key: string) => payPayoutRun(id!, key),
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin", "payout-runs", id], updated);
      void queryClient.invalidateQueries({ queryKey: ["admin", "payout-runs", "list"] });
      setConfirmKey(null);
    },
  });

  if (isLoading) return <div style={S.empty}>Loading…</div>;
  if (error || !run) return <div style={S.empty}>Couldn't load that payout run.</div>;

  const s = RUN_STATUS[run.status];
  const unsentCents = run.net.amount - run.sendable.amount;

  return (
    <div>
      <button type="button" onClick={() => navigate("/payouts")} style={S.backBtn}>
        ← All payout runs
      </button>

      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>{run.merchant.name}</h1>
          <p style={S.lede}>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{run.ref}</span> · payout day {dayText(run.run_date)}{" "}
            <span style={{ ...S.badge, background: s.bg, borderColor: s.border, color: s.fg, marginLeft: 6 }}>{s.label}</span>
          </p>
        </div>
      </div>

      <div style={S.panel}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>The payout</span>
        </div>
        <div style={{ padding: "16px 18px", display: "grid", gap: 10 }}>
          <Line label="Pays to" value={destinationText(run.destination)} />
          <Line
            label="Amount"
            value={
              unsentCents > 0
                ? `${money(run.sendable)} (net ${money(run.net)} - the bank takes whole shillings)`
                : money(run.sendable)
            }
          />
          <Line label="Covers" value={`${run.hires} completed ${run.hires === 1 ? "hire" : "hires"}`} />
          {run.provider_code && <Line label="Bank reference" value={run.provider_code} />}
          {run.paid_at && <Line label="Paid" value={new Date(run.paid_at).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })} />}
        </div>
      </div>

      {run.can_pay && !confirmKey && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setConfirmKey(`adm-${crypto.randomUUID()}`)}
            style={{ ...S.btn, background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" }}
          >
            {run.status === "failed" ? "Try paying again" : "Pay this run"}
          </button>
        </div>
      )}

      {confirmKey && (
        <div style={{ ...S.panel, marginTop: 16, borderColor: "#C3CBF5" }}>
          <div style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
            <div style={{ font: "600 15px/1.4 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>
              Send {money(run.sendable)} to {destinationText(run.destination)}?
            </div>
            <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
              This moves real money from CRAL's account. It can't be undone from here.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={S.btn} disabled={payMut.isPending} onClick={() => setConfirmKey(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={payMut.isPending}
                onClick={() => payMut.mutate(confirmKey)}
                style={{ ...S.btn, background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" }}
              >
                {payMut.isPending ? "Sending…" : "Send payout"}
              </button>
            </div>
          </div>
        </div>
      )}

      {payMut.error && (
        <div role="alert" style={S.error}>
          {payMut.error instanceof Error ? payMut.error.message : "That didn't go through. Try again."}
        </div>
      )}

      {run.attempts.length > 0 && (
        <div style={{ ...S.panel, marginTop: 16 }}>
          <div style={S.panelHead}>
            <span style={S.panelTitle}>Payment attempts</span>
          </div>
          {run.attempts.map((a) => (
            <Attempt key={a.id} a={a} />
          ))}
        </div>
      )}

      <div style={{ ...S.panel, marginTop: 16 }}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>Hires in this run</span>
        </div>
        {run.lines.map((l) => (
          <div key={l.id} style={S.lineRow}>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{l.booking_ref}</span> · {l.vehicle_registration}
              </div>
              <div style={S.muted}>
                {l.hirer_name} · {dayText(l.pickup_at)} to {dayText(l.dropoff_at)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{money(l.net)}</div>
              <div style={S.muted}>
                {money(l.gross)} less {money(l.commission)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Attempt({ a }: { a: PayoutAttempt }): JSX.Element {
  return (
    <div style={S.lineRow}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "600 14px/1.35 'Instrument Sans',sans-serif", color: a.status === "failed" ? "#A50E22" : "#1A1F2B" }}>
          {ATTEMPT_STATUS[a.status]}
        </div>
        <div style={S.muted}>
          {CHANNEL_LABEL[a.channel]}
          {a.bank_code ? ` (bank code ${a.bank_code})` : ""} · {new Date(a.created_at).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}
        </div>
        {a.failure_reason && <div style={{ ...S.muted, color: "#A50E22" }}>{a.failure_reason}</div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{money(a.sent)}</div>
        {a.provider_transaction_id && (
          <div style={{ ...S.muted, fontFamily: "'IBM Plex Mono',monospace" }}>{a.provider_transaction_id}</div>
        )}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div style={{ font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0", marginBottom: 3 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{value}</div>
    </div>
  );
}

const S = {
  backBtn: { height: 34, padding: "0 4px", background: "none", border: "none", font: "600 13px/1 'Instrument Sans',sans-serif", color: "#5A6373", cursor: "pointer", marginBottom: 10 },
  headRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 },
  h1: { margin: "0 0 4px", font: "600 clamp(21px,2.8vw,26px)/1.2 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.02em", color: "#1A1F2B" },
  lede: { margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 18px", borderBottom: "1px solid #F1F3F6" },
  panelTitle: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" },
  lineRow: { display: "flex", justifyContent: "space-between", gap: 16, padding: "13px 18px", borderBottom: "1px solid #F1F3F6" },
  muted: { font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  badge: { display: "inline-flex", alignItems: "center", padding: "2px 9px", border: "1px solid", borderRadius: 999, font: "600 10px/1.5 'IBM Plex Mono',monospace", letterSpacing: ".05em", verticalAlign: "middle" },
  btn: { height: 40, padding: "0 16px", background: "#FFFFFF", color: "#1A1F2B", border: "1px solid #E4E7EC", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  error: { marginTop: 16, padding: "11px 14px", background: "#FDE7EA", border: "1px solid #F7BDC5", borderRadius: "var(--r)", font: "500 13px/1.5 'Instrument Sans',sans-serif", color: "#A50E22" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;

import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { P } from "../portal/styles.js";
import { O } from "../onboarding/styles.js";
import { LINE_LABELS, SERVICE_LABELS, kesText } from "../../lib/garage-api.js";
import { useServiceRecord } from "../../lib/garage-orders-api.js";

/**
 * "Your work on this car" on a garage job (Phase 4 GS4): the jobs this
 * garage itself finished on the same customer car, from the car's service
 * record. Another garage's work on the car is never shown here. Shilling
 * amounts only: what the customer paid and what you kept.
 *
 * Not from a canvas; built from tokens.ts and GarageOrderDetail's cards.
 */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });
}

export function YourWorkOnThisCar({ orderId }: { orderId: string }): JSX.Element | null {
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useServiceRecord(orderId);
  if (isPending) return null;
  const entries = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div style={{ ...P.card, marginTop: 16, maxWidth: 820 }}>
      <div style={P.cardHead}>
        <span style={P.cardTitle}>Your work on this car</span>
        <span style={P.cardHeadTag}>{entries.length === 0 ? "NONE FINISHED YET" : "FINISHED JOBS"}</span>
      </div>
      <div style={{ padding: 18 }}>
        {entries.length === 0 ? (
          <div style={O.helper}>
            Jobs you finish on this car stay here, so you can see what you did last time. Only your own work is shown.
          </div>
        ) : (
          <>
            <div style={{ ...O.helper, marginBottom: 6 }}>Only jobs your garage finished are shown, never another garage&rsquo;s.</div>
            {entries.map((e) => (
              <div key={e.order_id} style={S.entry}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <Link to={`/garage/orders/${e.order_id}`} style={S.ref}>
                    {e.ref}
                  </Link>
                  <span style={S.date}>{fmtDate(e.completed_at)}</span>
                </div>
                <div style={S.title}>
                  {e.service_type ? (SERVICE_LABELS[e.service_type] ?? e.service_type) : "Garage job"}
                  {e.outlet_name ? ` · at ${e.outlet_name}` : ""}
                </div>
                {e.lines.map((l, i) => (
                  <div key={i} style={S.line}>
                    <span style={S.kind}>{(LINE_LABELS[l.kind] ?? l.kind).toUpperCase()}</span>
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{l.description}</span>
                    <span style={{ whiteSpace: "nowrap" }}>{kesText(l.amount)}</span>
                  </div>
                ))}
                <div style={{ ...O.helper, marginTop: 4 }}>
                  The customer paid {kesText(e.total)}. You kept {kesText(e.take_home)} after CRAL&rsquo;s service fee.
                </div>
              </div>
            ))}
            {hasNextPage && (
              <button
                type="button"
                style={{ ...P.actionBtn, minHeight: 44, marginTop: 12 }}
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? "Loading…" : "Show older jobs"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const S = {
  entry: { padding: "12px 0", borderTop: "1px solid #F1F3F6" },
  ref: { font: "500 13px/1.4 'IBM Plex Mono',monospace", color: "#0F23A8", textDecoration: "none" },
  date: { font: "500 12px/1.4 'IBM Plex Mono',monospace", color: "#838C9B" },
  title: { font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#1A1F2B", margin: "4px 0 2px" },
  line: { display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", font: "400 14px/1.45 'Instrument Sans',sans-serif", color: "#1A1F2B", flexWrap: "wrap" },
  kind: { width: 76, flex: "none", font: "500 10px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;

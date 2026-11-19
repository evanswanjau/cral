import { useState, type CSSProperties } from "react";
import { ApiClientError } from "../../lib/api.js";
import { LINE_LABELS, kesText, payGarageOrder, type GarageOrder, type OrderQuote } from "../../lib/garage-api.js";
import { bodyText } from "../subsite/Section.js";

/**
 * Pieces of the garage order page (Phase 4 GS3): an itemised quote and the
 * M-Pesa pay panel. Kept apart so the page stays under the 400-line rule.
 *
 * Not from a canvas; built from tokens.ts and GarageRequestPage's quote card.
 */

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
}

export function QuoteLines({ q, title, children }: { q: OrderQuote; title: string; children?: React.ReactNode }): JSX.Element {
  const state =
    q.paid_at ? `Paid ${fmtDateTime(q.paid_at)}`
    : q.status === "accepted" ? "Agreed, not paid yet"
    : q.status === "declined" ? "You said no"
    : q.status === "withdrawn" ? "Withdrawn by the garage"
    : q.expired ? `Expired ${fmtDateTime(q.valid_until)}`
    : `Waiting for your answer, valid until ${fmtDateTime(q.valid_until)}`;
  return (
    <article style={P.card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={P.mono}>{title}</div>
          <p style={{ ...bodyText, fontSize: 13, fontWeight: 600, color: "#0B0F1A" }}>{state}</p>
        </div>
        <div style={P.total}>{kesText(q.total)}</div>
      </div>
      <table style={P.table}>
        <tbody>
          {q.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ ...P.td, ...P.mono, width: 80 }}>{(LINE_LABELS[l.kind] ?? l.kind).toUpperCase()}</td>
              <td style={{ ...P.td, overflowWrap: "anywhere" }}>{l.description}</td>
              <td style={{ ...P.td, textAlign: "right", whiteSpace: "nowrap" }}>{kesText(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.note && <p style={{ ...bodyText, fontSize: 13, marginTop: 10 }}>&ldquo;{q.note}&rdquo;</p>}
      {children}
    </article>
  );
}

/** Send the M-Pesa prompt for whatever is due, then wait for it to settle. */
export function PayPanel({ order, onSent }: { order: GarageOrder; onSent: () => void }): JSX.Element | null {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!order.amount_due) return null;
  const pending = order.payment?.status === "pending" && order.payment.quote_id === order.due_quote_id;
  const failed = order.payment && order.payment.quote_id === order.due_quote_id && ["failed", "expired", "cancelled"].includes(order.payment.status);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    setBusy(true);
    try {
      await payGarageOrder(order.id, phone);
      onSent();
    } catch (err) {
      setProblem(err instanceof ApiClientError ? err.message : "Couldn't send the prompt. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ ...P.card, borderColor: "#C3CBF5", background: "#F7F8FE" }} aria-live="polite">
      <div style={P.mono}>PAY CRAL</div>
      <h2 style={P.h2}>{kesText(order.amount_due)} by M-Pesa</h2>
      <p style={{ ...bodyText, fontSize: 13 }}>
        CRAL holds the money and pays the garage only after you confirm the work is done.
      </p>
      {pending ? (
        <p style={{ ...bodyText, fontWeight: 600, color: "#0F23A8", marginTop: 12 }}>
          Check your phone and enter your M-Pesa PIN. This page updates once the payment lands.
        </p>
      ) : (
        <form onSubmit={(e) => void pay(e)} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <label style={{ flex: "1 1 200px" }}>
            <span style={P.label}>M-Pesa number</span>
            <input
              type="tel"
              inputMode="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712 345 678"
              style={P.input}
            />
          </label>
          <button type="submit" disabled={busy} style={{ ...P.primary, alignSelf: "flex-end" }}>
            {busy ? "Sending…" : `Pay ${kesText(order.amount_due)}`}
          </button>
        </form>
      )}
      {failed && !pending && (
        <p role="alert" style={{ ...bodyText, color: "#A50E22", marginTop: 8 }}>
          The last prompt didn't go through{order.payment?.failure_reason ? `: ${order.payment.failure_reason}` : ""}. Try again.
        </p>
      )}
      {problem && <p role="alert" style={{ ...bodyText, color: "#A50E22", marginTop: 8 }}>{problem}</p>}
    </section>
  );
}

export const P = {
  mono: { font: "500 10px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#838C9B" },
  h2: { margin: "4px 0 6px", font: "700 20px/1.2 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", color: "#0B0F1A" },
  total: { font: "700 20px/1.1 Archivo,sans-serif", color: "#0B0F1A", fontVariantNumeric: "tabular-nums" },
  card: { padding: 18, background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: 12 },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 12, font: "400 14px/1.45 'Instrument Sans',sans-serif", color: "#333B4A" },
  td: { padding: "8px 0", borderTop: "1px solid #F1F3F6", verticalAlign: "top", paddingRight: 10 },
  label: { display: "block", marginBottom: 6, font: "600 12px/1.3 'Instrument Sans',sans-serif", color: "#333B4A" },
  input: { width: "100%", boxSizing: "border-box", height: 44, padding: "0 12px", border: "1px solid #CDD2DA", borderRadius: 8, font: "400 15px/1 'Instrument Sans',sans-serif", color: "#0B0F1A", background: "#FFFFFF" },
  textarea: { width: "100%", boxSizing: "border-box", minHeight: 96, padding: 12, border: "1px solid #CDD2DA", borderRadius: 8, font: "400 15px/1.45 'Instrument Sans',sans-serif", color: "#0B0F1A", background: "#FFFFFF" },
  primary: { height: 44, padding: "0 18px", background: "#0F23A8", border: "none", borderRadius: 8, font: "600 14px/1 'Instrument Sans',sans-serif", color: "#FFFFFF", cursor: "pointer" },
  secondary: { height: 44, padding: "0 16px", background: "#FFFFFF", border: "1px solid #CDD2DA", borderRadius: 8, font: "600 14px/1 'Instrument Sans',sans-serif", color: "#0B0F1A", cursor: "pointer" },
  danger: { height: 44, padding: "0 16px", background: "#FFFFFF", border: "1px solid #CDD2DA", borderRadius: 8, font: "600 14px/1 'Instrument Sans',sans-serif", color: "#A50E22", cursor: "pointer" },
} satisfies Record<string, CSSProperties>;

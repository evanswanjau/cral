import { useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "../../lib/api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import {
  LINE_LABELS,
  ORDER_STATUS_LABELS,
  SERVICE_LABELS,
  acceptQuote,
  cancelGarageRequest,
  carName,
  getGarageRequest,
  kesText,
  type GarageQuote,
} from "../../lib/garage-api.js";
import { requestStatusLine } from "../../components/garage/YourGarageRequests.js";
import { bodyText } from "../../components/subsite/Section.js";

/**
 * `/garage/requests/:id`: one garage request and its quotes side by side,
 * cheapest first (Phase 4 GS2). Accepting one (GS3) creates the job and
 * opens its page, where the customer pays CRAL by M-Pesa.
 *
 * Not from a canvas; built from tokens.ts and the sub-site's Section idiom.
 */

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
}

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function QuoteCard({ q, rank, onAccept, busy }: { q: GarageQuote; rank: number; onAccept?: () => void; busy?: boolean }): JSX.Element {
  return (
    <article style={{ ...S.card, opacity: q.expired ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={S.mono}>{rank === 0 && !q.expired ? "LOWEST PRICE" : `QUOTE ${rank + 1}`}</div>
          <h3 style={S.h3}>{q.outlet?.name ?? "A garage"}</h3>
          <p style={{ ...bodyText, fontSize: 13 }}>
            {q.outlet ? `${q.outlet.address}, ${q.outlet.county}` : ""}
          </p>
          {q.outlet?.visited_on && <p style={{ ...bodyText, fontSize: 13 }}>Visited by CRAL on {fmtDay(q.outlet.visited_on)}</p>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={S.total}>{kesText(q.total)}</div>
          <div style={{ ...bodyText, fontSize: 13 }}>
            {q.days_needed} {q.days_needed === 1 ? "day" : "days"} of work
          </div>
        </div>
      </div>

      <table style={S.table}>
        <tbody>
          {q.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ ...S.td, ...S.mono, width: 80 }}>{(LINE_LABELS[l.kind] ?? l.kind).toUpperCase()}</td>
              <td style={{ ...S.td, overflowWrap: "anywhere" }}>{l.description}</td>
              <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap" }}>{kesText(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.note && <p style={{ ...bodyText, fontSize: 13, marginTop: 10 }}>&ldquo;{q.note}&rdquo;</p>}
      <p style={{ ...bodyText, fontSize: 12, marginTop: 10, color: q.expired ? "#A50E22" : "#5A6373" }}>
        {q.expired ? `Expired ${fmtDateTime(q.valid_until)}. The garage can send a new price.` : `Price valid until ${fmtDateTime(q.valid_until)}.`}
      </p>
      {onAccept && !q.expired && (
        <button type="button" onClick={onAccept} disabled={busy} style={S.primary}>
          {busy ? "Accepting…" : `Accept and pay ${kesText(q.total)}`}
        </button>
      )}
    </article>
  );
}

export function GarageRequestPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: r, isLoading, error } = useQuery({ queryKey: ["garage-requests", id], queryFn: () => getGarageRequest(id!), enabled: !!id });
  usePageTitle(r ? `${SERVICE_LABELS[r.service_type]} request` : "Garage request");
  const [closing, setClosing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const navigate = useNavigate();

  if (isLoading) return <div style={S.wrap}><p style={bodyText}>Loading…</p></div>;
  if (error || !r) {
    return (
      <div style={S.wrap}>
        <p style={bodyText}>That request isn't on your account.</p>
        <Link to="/garage" style={S.link}>Back to garage service</Link>
      </div>
    );
  }

  async function close() {
    setProblem(null);
    setClosing(true);
    try {
      queryClient.setQueryData(["garage-requests", id], await cancelGarageRequest(id!));
      await queryClient.invalidateQueries({ queryKey: ["garage-requests"] });
    } catch (err) {
      setProblem(err instanceof ApiClientError ? err.message : "Couldn't close it. Try again.");
    } finally {
      setClosing(false);
    }
  }

  async function accept(quoteId: string) {
    setProblem(null);
    setAccepting(quoteId);
    try {
      const order = await acceptQuote(id!, quoteId);
      await queryClient.invalidateQueries({ queryKey: ["garage-requests"] });
      navigate(`/garage/orders/${order.id}`);
    } catch (err) {
      setProblem(err instanceof ApiClientError ? err.message : "Couldn't accept that quote. Try again.");
      setAccepting(null);
    }
  }

  const quotes = r.quotes ?? [];
  return (
    <div style={S.wrap}>
      <Link to="/garage" style={S.link}>← Garage service</Link>
      <div style={{ ...S.mono, marginTop: 18 }}>{SERVICE_LABELS[r.service_type].toUpperCase()} · {r.county.toUpperCase()}</div>
      <h1 style={S.h1}>{r.car ? `${carName(r.car)} · ${r.car.plate}` : "Your car"}</h1>
      <p style={{ ...bodyText, maxWidth: 640 }}>{r.description}</p>
      <p style={{ ...bodyText, fontWeight: 600, color: "#0B0F1A", marginTop: 10 }}>
        {requestStatusLine(r)}
        {r.garages_declined > 0 ? ` · ${r.garages_declined} said they can't do it` : ""}
      </p>

      {r.order && (
        <div style={S.notice}>
          Job <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{r.order.ref}</span>: {ORDER_STATUS_LABELS[r.order.status]}.{" "}
          <Link to={`/garage/orders/${r.order.id}`} style={{ color: "#0F23A8", fontWeight: 600 }}>Open the job</Link>
        </div>
      )}
      {r.status === "open" && quotes.length > 0 && (
        <div style={S.notice}>
          Accepting a quote books that garage. You pay CRAL by M-Pesa, CRAL holds it, and the garage is paid only after you confirm the work is done.
        </div>
      )}

      <div style={{ display: "grid", gap: 14, marginTop: 20 }}>
        {quotes.length === 0 && r.status === "open" && (
          <p style={bodyText}>
            No quotes yet. You'll see each one here and in your notifications as it comes in.
          </p>
        )}
        {quotes.map((q, i) => (
          <QuoteCard
            key={q.id}
            q={q}
            rank={i}
            busy={accepting === q.id}
            {...(r.status === "open" ? { onAccept: () => void accept(q.id) } : {})}
          />
        ))}
      </div>

      {r.status === "open" && (
        <div style={{ marginTop: 24 }}>
          <button type="button" onClick={() => void close()} disabled={closing} style={S.secondary}>
            {closing ? "Closing…" : "Close this request"}
          </button>
          <p style={{ ...bodyText, fontSize: 12, marginTop: 6 }}>Garages can no longer quote once it's closed.</p>
          {problem && <p role="alert" style={{ ...bodyText, color: "#A50E22" }}>{problem}</p>}
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { maxWidth: 880, margin: "0 auto", padding: "clamp(24px,4vw,48px) clamp(16px,4vw,40px)" },
  link: { display: "inline-flex", alignItems: "center", minHeight: 44, font: "600 13px/1 'Instrument Sans',sans-serif", color: "#0F23A8", textDecoration: "none" },
  mono: { font: "500 10px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#838C9B" },
  h1: { margin: "6px 0 10px", font: "700 clamp(24px,3.4vw,34px)/1.1 Archivo,sans-serif", fontVariationSettings: "'wdth' 108", letterSpacing: "-.02em", color: "#0B0F1A" },
  h3: { margin: "4px 0 4px", font: "600 18px/1.25 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", color: "#0B0F1A" },
  total: { font: "700 22px/1.1 Archivo,sans-serif", color: "#0B0F1A", fontVariantNumeric: "tabular-nums" },
  card: { padding: 18, background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: 12 },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 14, font: "400 14px/1.45 'Instrument Sans',sans-serif", color: "#333B4A" },
  td: { padding: "8px 0", borderTop: "1px solid #F1F3F6", verticalAlign: "top", paddingRight: 10 },
  notice: { marginTop: 18, padding: "12px 14px", background: "#EDEFFC", border: "1px solid #C3CBF5", borderRadius: 8, font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#0F23A8" },
  primary: { marginTop: 12, height: 44, padding: "0 18px", background: "#0F23A8", border: "none", borderRadius: 8, font: "600 14px/1 'Instrument Sans',sans-serif", color: "#FFFFFF", cursor: "pointer" },
  secondary: { height: 44, padding: "0 16px", background: "#FFFFFF", border: "1px solid #CDD2DA", borderRadius: 8, font: "600 14px/1 'Instrument Sans',sans-serif", color: "#A50E22", cursor: "pointer" },
} satisfies Record<string, CSSProperties>;

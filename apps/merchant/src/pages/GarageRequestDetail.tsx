import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import { P } from "../components/portal/styles.js";
import { O } from "../components/onboarding/styles.js";
import { useToast } from "../components/portal/Toast.js";
import {
  CONDITIONS,
  CONDITION_LABELS,
  FULFILMENT_LABELS,
  LINE_KINDS,
  LINE_LABELS,
  kesText,
  previewQuote,
  useDeclineRequest,
  useGarageRequest,
  useSendQuote,
  useWithdrawQuote,
  requestTitle,
  type Fulfilment,
  type GarageRequest,
  type LineKind,
  type PartCondition,
} from "../lib/garage-api.js";
import type { Money } from "../lib/vehicles-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * One quote request and this garage's itemised quote (Phase 4 GS2). The
 * take-home figure comes from the API in shillings after CRAL's service
 * fee; the fee rate is never shown here. A parts request (PT1) is the same
 * screen: the quote also names the part's condition and whether the dealer
 * fits it or delivers it (a delivered part carries a priced delivery line).
 * Not from a canvas; built from tokens.ts and the portal's detail idiom.
 */

type LineDraft = { kind: LineKind; description: string; shillings: string };

const blankLine = (kind: LineKind = "labour"): LineDraft => ({ kind, description: "", shillings: "" });

function fromQuote(r: GarageRequest): { lines: LineDraft[]; days: string; note: string } {
  const q = r.my_quote;
  if (!q && r.kind === "part") return { lines: [blankLine("part"), blankLine("delivery")], days: "1", note: "" };
  if (!q) return { lines: [blankLine("part"), blankLine("labour")], days: "1", note: "" };
  return {
    lines: q.lines.map((l) => ({ kind: l.kind, description: l.description, shillings: String(Math.round(l.amount.amount / 100)) })),
    days: String(q.days_needed),
    note: q.note ?? "",
  };
}

function toLines(lines: LineDraft[]) {
  return lines
    .filter((l) => l.description.trim() && Number(l.shillings) > 0)
    .map((l) => ({ kind: l.kind, description: l.description.trim(), amount: Math.round(Number(l.shillings) * 100) }));
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function GarageRequestDetail(): JSX.Element {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const flash = useToast();
  const { data: r, isPending, error } = useGarageRequest(requestId);
  usePageTitle(r?.car ? `${r.car.make} ${r.car.model} request` : "Quote request");

  const send = useSendQuote(requestId ?? "");
  const withdraw = useWithdrawQuote(requestId ?? "");
  const decline = useDeclineRequest(requestId ?? "");

  const [lines, setLines] = useState<LineDraft[]>([]);
  const [days, setDays] = useState("1");
  const [note, setNote] = useState("");
  const [condition, setCondition] = useState<PartCondition | "">("");
  const [fulfilment, setFulfilment] = useState<Fulfilment | "">("");
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<{ total: Money; take_home: Money } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!r) return;
    const d = fromQuote(r);
    setLines(d.lines);
    setDays(d.days);
    setNote(d.note);
    setCondition(r.my_quote?.part_condition ?? "");
    setFulfilment(r.my_quote?.fulfilment ?? "");
  }, [r?.id, r?.my_quote?.id, r?.my_quote?.sent_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the merchant keeps, from the API (never computed here from a rate).
  const valid = toLines(lines);
  const key = JSON.stringify(valid);
  useEffect(() => {
    if (!valid.length) return setPreview(null);
    const t = setTimeout(() => {
      previewQuote(valid, r?.kind ?? "service").then(setPreview).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) return <div style={{ color: "#838C9B" }}>Loading…</div>;
  if (error || !r) {
    return (
      <div>
        <button type="button" style={P.backLink} onClick={() => navigate("/garage/requests")}>← All quote requests</button>
        <p style={P.lede}>That request wasn't sent to your premises.</p>
      </div>
    );
  }

  const open = r.status === "open" && !r.declined;
  const q = r.my_quote;
  const showForm = open && (editing || !q || q.status !== "sent");
  const fail = (err: unknown) => flash(err instanceof Error ? err.message : "Something went wrong. Try again.", "#FF8A8A");
  const isPart = r.kind === "part";

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function submit() {
    setProblem(null);
    if (!valid.length) return setProblem("Add at least one line with a description and an amount.");
    if (valid.length !== lines.filter((l) => l.description.trim() || l.shillings).length) {
      return setProblem("Each line needs a description and an amount, or remove it.");
    }
    const d = Number(days);
    if (!Number.isInteger(d) || d < 1 || d > 60) {
      return setProblem(isPart ? "Say how many days until the part is fitted or delivered, 1 to 60." : "Say how many days the work takes, 1 to 60.");
    }
    if (isPart && !condition) return setProblem("Say whether the part is genuine, OEM or used.");
    if (isPart && !fulfilment) return setProblem("Say whether you fit the part or deliver it.");
    if (isPart && fulfilment === "delivered" && !valid.some((l) => l.kind === "delivery")) {
      return setProblem("Add a delivery line with its price.");
    }
    if (isPart && fulfilment === "fitted" && valid.some((l) => l.kind === "delivery")) {
      return setProblem("A part you fit at your premises has no delivery line. Remove it.");
    }
    send.mutate(
      {
        lines: valid,
        days_needed: d,
        note: note.trim() || null,
        ...(isPart && condition && fulfilment ? { part_condition: condition, fulfilment } : {}),
      },
      {
        onSuccess: () => {
          setEditing(false);
          flash(q ? "Quote updated and sent." : "Quote sent.", "#57D69E");
        },
        onError: fail,
      },
    );
  }

  return (
    <div>
      <button type="button" style={P.backLink} onClick={() => navigate("/garage/requests")}>← All quote requests</button>

      <div style={P.mastCard}>
        <div style={P.mastTop}>
          <div>
            <h1 style={P.mastH1}>{r.car ? `${r.car.year} ${r.car.make} ${r.car.model}` : "A car"}</h1>
            <div style={P.mastSub}>
              {requestTitle(r)} · {r.county}
              {r.customer_first_name ? ` · from ${r.customer_first_name}` : ""}
              {r.outlet ? ` · to ${r.outlet.name}` : ""}
            </div>
          </div>
          {r.car && (
            <div style={{ textAlign: "right" }}>
              <div style={P.mastRefLabel}>PLATE</div>
              <div style={P.mastRef}>{r.car.plate}</div>
              {r.car.chassis_number && (
                <>
                  <div style={{ ...P.mastRefLabel, marginTop: 8 }}>CHASSIS</div>
                  <div style={P.mastRef}>{r.car.chassis_number}</div>
                </>
              )}
            </div>
          )}
        </div>
        <p style={{ ...P.lede, maxWidth: 720, margin: "12px 0 0" }}>{r.description}</p>
        {isPart && r.delivery_address && (
          <p style={{ ...P.lede, maxWidth: 720, margin: "8px 0 0" }}>Deliver to: {r.delivery_address}</p>
        )}
      </div>

      {q?.status === "accepted" && q.order_id ? (
        <div style={{ ...P.card, marginTop: 16, padding: 16, maxWidth: 820, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ ...P.lede, flex: "1 1 260px" }}>
            The customer accepted your quote. Follow the {isPart ? "order" : "job"} from payment to payout.
          </span>
          <button type="button" style={{ ...P.actionBtn, minHeight: 44 }} onClick={() => navigate(`/garage/orders/${q.order_id}`)}>
            {isPart ? "Open the order" : "Open the job"}
          </button>
        </div>
      ) : (
        !open && (
          <div style={{ ...P.card, marginTop: 16, padding: 16, maxWidth: 820 }}>
            <span style={P.lede}>
              {r.declined
                ? isPart
                  ? "You said you can't supply this part."
                  : "You said this garage can't do this job."
                : q?.status === "superseded"
                  ? `The customer chose another ${isPart ? "dealer" : "garage"} this time.`
                  : "The customer has closed this request. It can't be quoted any more."}
            </span>
          </div>
        )
      )}

      {q && q.status === "sent" && !editing && (
        <div style={{ ...P.card, marginTop: 16, maxWidth: 820 }}>
          <div style={P.cardHead}>
            <span style={P.cardTitle}>Your quote</span>
            <span style={{ ...P.cardHeadTag, color: q.expired ? "#A50E22" : "#076945" }}>
              {q.expired ? `EXPIRED ${fmtDateTime(q.valid_until).toUpperCase()}` : `VALID UNTIL ${fmtDateTime(q.valid_until).toUpperCase()}`}
            </span>
          </div>
          <div style={{ padding: 18 }}>
            {q.lines.map((l, i) => (
              <div key={i} style={S.line}>
                <span style={S.kind}>{LINE_LABELS[l.kind].toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{l.description}</span>
                <span style={{ whiteSpace: "nowrap" }}>{kesText(l.amount)}</span>
              </div>
            ))}
            <div style={{ ...S.line, fontWeight: 700, borderBottom: "none" }}>
              <span style={{ flex: 1 }}>
                Customer pays · {q.days_needed} {q.days_needed === 1 ? "day" : "days"}
                {isPart ? "" : " of work"}
                {q.part_condition ? ` · ${CONDITION_LABELS[q.part_condition]}` : ""}
                {q.fulfilment ? ` · ${FULFILMENT_LABELS[q.fulfilment]}` : ""}
              </span>
              <span>{kesText(q.total)}</span>
            </div>
            <div style={{ ...O.helper, marginTop: 4 }}>You keep {kesText(q.take_home)} after CRAL&rsquo;s service fee.</div>
          </div>
          {open && (
            <div style={{ ...P.mastActions, padding: "0 18px 18px" }}>
              <button type="button" style={{ ...P.actionBtn, minHeight: 44 }} onClick={() => setEditing(true)}>Change quote</button>
              <button
                type="button"
                style={{ ...P.actionBtn, minHeight: 44 }}
                disabled={withdraw.isPending}
                onClick={() => withdraw.mutate(undefined, { onSuccess: () => flash("Quote withdrawn.", "#8C97A8"), onError: fail })}
              >
                Withdraw quote
              </button>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div style={{ ...P.card, marginTop: 16, maxWidth: 820 }}>
          <div style={P.cardHead}>
            <span style={P.cardTitle}>{q ? "Change your quote" : "Send a quote"}</span>
            <span style={P.cardHeadTag}>VALID 48 HOURS FROM SENDING</span>
          </div>
          <div style={{ padding: 18, display: "grid", gap: 10 }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select style={{ ...O.select, width: 130, flex: "none" }} value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value as LineKind })} aria-label="Line type">
                  {LINE_KINDS.map((k) => (
                    <option key={k} value={k}>{LINE_LABELS[k]}</option>
                  ))}
                </select>
                <input style={{ ...O.input, flex: "1 1 200px" }} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Oil filter" aria-label="Description" />
                <input
                  style={{ ...O.input, width: 130, flex: "none" }}
                  inputMode="numeric"
                  value={l.shillings}
                  onChange={(e) => setLine(i, { shillings: e.target.value.replace(/\D/g, "") })}
                  placeholder="KES"
                  aria-label="Amount in shillings"
                />
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF", border: "1px solid #CDD2DA", borderRadius: 8, cursor: "pointer" }}
                >
                  <Trash size={18} color="#A50E22" />
                </button>
              </div>
            ))}
            <div>
              <button type="button" style={{ ...P.actionBtn, minHeight: 44, color: "#0F23A8" }} onClick={() => setLines([...lines, blankLine()])} disabled={lines.length >= 30}>
                Add a line
              </button>
            </div>
            {isPart && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label style={{ flex: "1 1 200px" }}>
                  <span style={O.label}>Condition</span>
                  <select style={O.select} value={condition} onChange={(e) => setCondition(e.target.value as PartCondition)}>
                    <option value="">Select</option>
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
                    ))}
                  </select>
                </label>
                <label style={{ flex: "1 1 240px" }}>
                  <span style={O.label}>How the customer gets it</span>
                  <select style={O.select} value={fulfilment} onChange={(e) => setFulfilment(e.target.value as Fulfilment)}>
                    <option value="">Select</option>
                    <option value="delivered">{FULFILMENT_LABELS.delivered}</option>
                    <option value="fitted">{FULFILMENT_LABELS.fitted}</option>
                  </select>
                </label>
              </div>
            )}
            {isPart && fulfilment === "delivered" && (
              <div style={O.helper}>Price your own delivery as a Delivery line. CRAL arranges no riders.</div>
            )}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ flex: "0 0 160px" }}>
                <span style={O.label}>{isPart ? "Days to hand over" : "Days of work"}</span>
                <input style={O.input} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 2))} />
              </label>
              <label style={{ flex: "1 1 260px" }}>
                <span style={O.label}>Note for the customer (optional)</span>
                <input style={O.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Brake pads are worn, we recommend replacing them." />
              </label>
            </div>
            <div style={{ padding: "12px 14px", background: "#FAFBFC", borderRadius: 8 }}>
              {preview ? (
                <>
                  <div style={{ font: "700 16px/1.3 Archivo,sans-serif", color: "#0B0F1A" }}>Customer pays {kesText(preview.total)}</div>
                  <div style={O.helper}>You keep {kesText(preview.take_home)} after CRAL&rsquo;s service fee.</div>
                </>
              ) : (
                <div style={O.helper}>Add a line with an amount to see what you keep.</div>
              )}
            </div>
            {problem && <div style={O.fieldError}>{problem}</div>}
            <div style={P.mastActions}>
              <button
                type="button"
                style={{ ...P.actionBtn, minHeight: 44, background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" }}
                disabled={send.isPending}
                onClick={submit}
              >
                {send.isPending ? "Sending…" : "Send quote"}
              </button>
              {editing && (
                <button type="button" style={{ ...P.actionBtn, minHeight: 44 }} onClick={() => setEditing(false)}>Cancel</button>
              )}
              <button
                type="button"
                style={{ ...P.deleteBtn, minHeight: 44 }}
                disabled={decline.isPending}
                onClick={() => decline.mutate(undefined, { onSuccess: () => flash("Marked as a job you can't do.", "#8C97A8"), onError: fail })}
              >
                {isPart ? "We can\u2019t supply this part" : "We can\u2019t do this job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  line: { display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid #F1F3F6", font: "400 14px/1.45 'Instrument Sans',sans-serif", color: "#1A1F2B", flexWrap: "wrap" },
  kind: { width: 76, flex: "none", font: "500 10px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;

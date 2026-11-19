import { useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { O } from "../components/onboarding/styles.js";
import { useToast } from "../components/portal/Toast.js";
import { ExtraQuoteForm } from "../components/garage/ExtraQuoteForm.js";
import { YourWorkOnThisCar } from "../components/garage/YourWorkOnThisCar.js";
import { CONDITION_LABELS, FULFILMENT_LABELS, LINE_LABELS, SERVICE_LABELS, kesText } from "../lib/garage-api.js";
import {
  orderStatus,
  useGarageOrder,
  useMarkReady,
  useSendExtra,
  useStartOrder,
  useWithdrawExtra,
  type GarageOrder,
  type OrderQuote,
} from "../lib/garage-orders-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * One garage job (Phase 4 GS3): start once paid, send an extra-work quote
 * if the job needs more, mark the car ready. Amounts in shillings: what the
 * customer paid and what the garage keeps after CRAL's service fee, never
 * the rate. A part order (PT1) is the same screen: no extra work, and the
 * dealer marks the part delivered or fitted once paid. Not from a canvas;
 * built from tokens.ts and GarageRequestDetail.
 */

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
}

function nextStepPart(o: GarageOrder): string {
  const fitted = o.fulfilment === "fitted";
  switch (o.status) {
    case "awaiting_payment":
      return "The customer accepted your quote and is paying CRAL. Don't hand the part over until this says paid.";
    case "paid":
    case "in_progress":
      return fitted
        ? "The customer has paid CRAL. Fit the part, then mark it fitted."
        : "The customer has paid CRAL. Deliver the part to the address below, then mark it delivered.";
    case "ready":
      return o.auto_confirm_at
        ? `Waiting for the customer to confirm it's the right part. If they report nothing, it confirms itself on ${fmtDateTime(o.auto_confirm_at)}.`
        : "Waiting for the customer to confirm it's the right part.";
    case "completed":
      return "Confirmed. What you keep joins your next payout run.";
    case "problem":
      return "The customer says it's the wrong part. CRAL support will contact you. The payment stays with CRAL until it's settled.";
    case "cancelled":
      return "The customer cancelled before paying. Nothing is owed either way.";
    case "refunded":
      return "CRAL settled the dispute by refunding the customer.";
  }
}

function nextStep(o: GarageOrder): string {
  if (o.kind === "part") return nextStepPart(o);
  switch (o.status) {
    case "awaiting_payment":
      return "The customer accepted your quote and is paying CRAL. Don't start until this says paid.";
    case "paid":
      return "The customer has paid CRAL. Start the work when the car is with you.";
    case "in_progress":
      return "Found more to do? Send an extra-work quote. Nothing extra is billed unless the customer says yes and pays.";
    case "ready":
      return o.auto_confirm_at
        ? `Waiting for the customer to confirm. If they raise no problem, it confirms itself on ${fmtDateTime(o.auto_confirm_at)}.`
        : "Waiting for the customer to confirm.";
    case "completed":
      return "Confirmed. What you keep joins your next payout run.";
    case "problem":
      return "The customer raised a problem. CRAL support will contact you. The payment stays with CRAL until it's settled.";
    case "cancelled":
      return "The customer cancelled before paying. Nothing is owed either way.";
    case "refunded":
      return "CRAL settled the problem by refunding the customer.";
  }
}

function quoteState(q: OrderQuote): string {
  if (q.paid_at) return `PAID ${fmtDateTime(q.paid_at).toUpperCase()}`;
  if (q.status === "accepted") return "ACCEPTED, NOT PAID YET";
  if (q.status === "declined") return "CUSTOMER SAID NO";
  if (q.status === "withdrawn") return "WITHDRAWN";
  if (q.expired) return "EXPIRED";
  return `WAITING ON CUSTOMER, VALID UNTIL ${fmtDateTime(q.valid_until).toUpperCase()}`;
}

export function GarageOrderDetail(): JSX.Element {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const flash = useToast();
  const { data: o, isPending, error } = useGarageOrder(orderId);
  usePageTitle(o ? `${o.kind === "part" ? "Order" : "Job"} ${o.ref}` : "Garage job");
  const start = useStartOrder(orderId ?? "");
  const ready = useMarkReady(orderId ?? "");
  const sendExtra = useSendExtra(orderId ?? "");
  const withdraw = useWithdrawExtra(orderId ?? "");
  const [extraOpen, setExtraOpen] = useState(false);

  if (isPending) return <div style={{ color: "#838C9B" }}>Loading…</div>;
  if (error || !o) {
    return (
      <div>
        <button type="button" style={P.backLink} onClick={() => navigate("/garage/orders")}>← All jobs</button>
        <p style={P.lede}>That job or order isn't one of yours.</p>
      </div>
    );
  }

  const fail = (err: unknown) => flash(err instanceof Error ? err.message : "Something went wrong. Try again.", "#FF8A8A");
  const s = orderStatus(o);
  const isPart = o.kind === "part";
  const word = isPart ? "order" : "job";
  const openExtra = o.quotes.find((q) => q.kind === "extra" && (q.status === "sent" || (q.status === "accepted" && !q.paid_at)));
  const primary: CSSProperties = { ...P.actionBtn, minHeight: 44, background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" };

  return (
    <div>
      <button type="button" style={P.backLink} onClick={() => navigate("/garage/orders")}>← All jobs</button>

      <div style={P.mastCard}>
        <div style={P.mastTop}>
          <div>
            <h1 style={P.mastH1}>{o.car ? `${o.car.year} ${o.car.make} ${o.car.model}` : "A car"}</h1>
            <div style={P.mastSub}>
              {isPart ? (o.part_name ?? "A part") : o.service_type ? (SERVICE_LABELS[o.service_type] ?? o.service_type) : "Garage job"}
              {o.part_condition ? ` · ${CONDITION_LABELS[o.part_condition]}` : ""}
              {o.customer_first_name ? ` · for ${o.customer_first_name}` : ""}
              {o.outlet ? ` · at ${o.outlet.name}` : ""}
            </div>
            <div style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: s.color, marginTop: 8 }}>{s.label}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={P.mastRefLabel}>{isPart ? "ORDER" : "JOB"}</div>
            <div style={P.mastRef}>{o.ref}</div>
            {o.car && (
              <>
                <div style={{ ...P.mastRefLabel, marginTop: 8 }}>PLATE</div>
                <div style={P.mastRef}>{o.car.plate}</div>
              </>
            )}
          </div>
        </div>
        {o.description && <p style={{ ...P.lede, maxWidth: 720, margin: "12px 0 0" }}>{o.description}</p>}
        {isPart && o.fulfilment && (
          <p style={{ ...P.lede, maxWidth: 720, margin: "8px 0 0" }}>
            {FULFILMENT_LABELS[o.fulfilment]}
            {o.fulfilment === "delivered" && o.delivery_address ? `, to ${o.delivery_address}` : ""}
          </p>
        )}
        <p style={{ ...P.lede, maxWidth: 720, margin: "12px 0 0", color: "#1A1F2B" }}>{nextStep(o)}</p>
        <div style={{ ...P.mastActions, marginTop: 14 }}>
          {isPart && (o.status === "paid" || o.status === "in_progress") && (
            <button
              type="button"
              style={primary}
              disabled={ready.isPending}
              onClick={() =>
                ready.mutate(undefined, {
                  onSuccess: () => flash("The customer has been asked to confirm it's the right part.", "#57D69E"),
                  onError: fail,
                })
              }
            >
              {ready.isPending ? "Saving…" : o.fulfilment === "fitted" ? "Mark it fitted" : "Mark it delivered"}
            </button>
          )}
          {!isPart && o.status === "paid" && (
            <button type="button" style={primary} disabled={start.isPending} onClick={() => start.mutate(undefined, { onSuccess: () => flash("Marked as started.", "#57D69E"), onError: fail })}>
              {start.isPending ? "Saving…" : "Start the work"}
            </button>
          )}
          {!isPart && o.status === "in_progress" && (
            <>
              <button
                type="button"
                style={primary}
                disabled={ready.isPending || !!openExtra}
                onClick={() => ready.mutate(undefined, { onSuccess: () => flash("The customer has been told the car is ready.", "#57D69E"), onError: fail })}
              >
                {ready.isPending ? "Saving…" : "The car is ready"}
              </button>
              {!openExtra && !extraOpen && (
                <button type="button" style={{ ...P.actionBtn, minHeight: 44 }} onClick={() => setExtraOpen(true)}>
                  Quote extra work
                </button>
              )}
            </>
          )}
        </div>
        {o.status === "in_progress" && openExtra && (
          <div style={{ ...O.helper, marginTop: 8 }}>The car can be marked ready once the customer has answered and paid the extra-work quote, or you withdraw it.</div>
        )}
      </div>

      {extraOpen && o.status === "in_progress" && (
        <div style={{ ...P.card, marginTop: 16, maxWidth: 820 }}>
          <div style={P.cardHead}>
            <span style={P.cardTitle}>Quote extra work</span>
            <span style={P.cardHeadTag}>VALID 48 HOURS FROM SENDING</span>
          </div>
          <ExtraQuoteForm
            busy={sendExtra.isPending}
            onCancel={() => setExtraOpen(false)}
            onSend={(input) =>
              sendExtra.mutate(input, {
                onSuccess: () => {
                  setExtraOpen(false);
                  flash("Extra-work quote sent to the customer.", "#57D69E");
                },
                onError: fail,
              })
            }
          />
        </div>
      )}

      {o.quotes.map((q) => (
        <div key={q.id} style={{ ...P.card, marginTop: 16, maxWidth: 820 }}>
          <div style={P.cardHead}>
            <span style={P.cardTitle}>{q.kind === "original" ? "The quote the customer accepted" : "Extra work"}</span>
            <span style={P.cardHeadTag}>{quoteState(q)}</span>
          </div>
          <div style={{ padding: 18 }}>
            {q.lines.map((l, i) => (
              <div key={i} style={S.line}>
                <span style={S.kind}>{(LINE_LABELS[l.kind] ?? l.kind).toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{l.description}</span>
                <span style={{ whiteSpace: "nowrap" }}>{kesText(l.amount)}</span>
              </div>
            ))}
            <div style={{ ...S.line, fontWeight: 700, borderBottom: "none" }}>
              <span style={{ flex: 1 }}>
                Customer pays · {q.days_needed} {q.days_needed === 1 ? "day" : "days"}
                {isPart ? "" : " of work"}
              </span>
              <span>{kesText(q.total)}</span>
            </div>
            <div style={{ ...O.helper, marginTop: 4 }}>You keep {kesText(q.take_home)} after CRAL&rsquo;s service fee.</div>
            {q.note && <div style={{ ...O.helper, marginTop: 4 }}>Your note: {q.note}</div>}
          </div>
          {q.kind === "extra" && openExtra?.id === q.id && (
            <div style={{ ...P.mastActions, padding: "0 18px 18px" }}>
              <button
                type="button"
                style={{ ...P.actionBtn, minHeight: 44 }}
                disabled={withdraw.isPending}
                onClick={() => withdraw.mutate(q.id, { onSuccess: () => flash("Extra-work quote withdrawn.", "#8C97A8"), onError: fail })}
              >
                Withdraw extra-work quote
              </button>
            </div>
          )}
        </div>
      ))}

      <div style={{ ...P.card, marginTop: 16, maxWidth: 820, padding: 18 }}>
        <div style={{ ...S.line, borderBottom: "none" }}>
          <span style={{ flex: 1 }}>Paid by the customer for this {word} so far</span>
          <span style={{ fontWeight: 700 }}>{kesText(o.total)}</span>
        </div>
        <div style={O.helper}>
          You keep {kesText(o.take_home)} after CRAL&rsquo;s service fee. It joins your payout run once the {word} is confirmed.
        </div>
      </div>

      {!isPart && <YourWorkOnThisCar orderId={o.id} />}

      {o.problem_note && (o.status === "problem" || o.status === "refunded" || o.confirmed_by === "ops") && (
        <div style={{ ...P.card, marginTop: 16, maxWidth: 820, padding: 18 }}>
          <div style={P.cardTitle}>What the customer said</div>
          <p style={{ ...P.lede, margin: "6px 0 0" }}>{o.problem_note}</p>
          {o.resolution_note && (
            <>
              <div style={{ ...P.cardTitle, marginTop: 12 }}>How CRAL settled it</div>
              <p style={{ ...P.lede, margin: "6px 0 0" }}>{o.resolution_note}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const S = {
  line: { display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid #F1F3F6", font: "400 14px/1.45 'Instrument Sans',sans-serif", color: "#1A1F2B", flexWrap: "wrap" },
  kind: { width: 76, flex: "none", font: "500 10px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;

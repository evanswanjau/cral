import { useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "../../lib/api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import {
  CONDITION_LABELS,
  FULFILMENT_LABELS,
  SERVICE_LABELS,
  acceptExtraQuote,
  cancelGarageOrder,
  carName,
  confirmGarageOrder,
  declineExtraQuote,
  getGarageOrder,
  kesText,
  orderStatusLabel,
  raiseGarageProblem,
  type GarageOrder,
} from "../../lib/garage-api.js";
import { P, PayPanel, QuoteLines, fmtDateTime } from "../../components/garage/OrderParts.js";
import { bodyText } from "../../components/subsite/Section.js";

/**
 * `/garage/orders/:id`: one garage job (Phase 4 GS3). Pay CRAL by M-Pesa,
 * answer an extra-work quote, then confirm the job or raise a problem. A
 * ready job confirms itself 72 h after "ready" unless a problem is raised.
 * A part order (PT1, docs/decisions/parts.md) reads the same: the dealer
 * marks it delivered or fitted, the customer confirms it's the right part
 * or reports a wrong part, which goes to CRAL support.
 *
 * Not from a canvas; built from tokens.ts and GarageRequestPage.
 */

function whatNextPart(o: GarageOrder): string {
  const fitted = o.fulfilment === "fitted";
  switch (o.status) {
    case "awaiting_payment":
      return "Pay CRAL to order the part. The dealer sends or fits it once your payment lands.";
    case "paid":
    case "in_progress":
      return fitted
        ? "Your payment is with CRAL. The dealer will fit the part at their premises."
        : "Your payment is with CRAL. The dealer will deliver the part to your address.";
    case "ready":
      return o.auto_confirm_at
        ? `Check it's the right part for your car and confirm. If you say nothing, it confirms itself on ${fmtDateTime(o.auto_confirm_at)}.`
        : "Check it's the right part for your car and confirm.";
    case "completed":
      return o.confirmed_by === "auto"
        ? "Confirmed automatically 72 hours after the part was handed over. The dealer is being paid."
        : "Confirmed. The dealer is being paid.";
    case "problem":
      return "CRAL support is looking into the wrong part you reported and will contact you. The money stays with CRAL until it's settled.";
    case "refunded":
      return "Your payment is being sent back to the M-Pesa number it came from.";
    case "cancelled":
      return "You cancelled this order before paying. Nothing was charged.";
  }
}

function whatNext(o: GarageOrder): string {
  if (o.kind === "part") return whatNextPart(o);
  switch (o.status) {
    case "awaiting_payment":
      return "Pay CRAL to book the job. The garage starts once your payment lands.";
    case "paid":
      return "Your payment is with CRAL. The garage will start on your car.";
    case "in_progress":
      return "The garage is working on your car. If it finds more to do, you'll get a second quote here first.";
    case "ready":
      return o.auto_confirm_at
        ? `Collect your car and confirm the job. If you say nothing, it confirms itself on ${fmtDateTime(o.auto_confirm_at)}.`
        : "Collect your car and confirm the job.";
    case "completed":
      return o.confirmed_by === "auto"
        ? "Confirmed automatically 72 hours after the car was ready. The garage is being paid."
        : "Confirmed. The garage is being paid.";
    case "problem":
      return "CRAL support is looking into the problem you raised and will contact you. The money stays with CRAL until it's settled.";
    case "refunded":
      return "Your payment is being sent back to the M-Pesa number it came from.";
    case "cancelled":
      return "You cancelled this job before paying. Nothing was charged.";
  }
}

export function GarageOrderPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: o, isLoading, error } = useQuery({
    queryKey: ["garage-orders", id],
    queryFn: () => getGarageOrder(id!),
    enabled: !!id,
    // Poll while an M-Pesa prompt is open so the page moves when it lands.
    refetchInterval: (q) => (q.state.data?.payment?.status === "pending" ? 4000 : false),
  });
  usePageTitle(o ? `${o.kind === "part" ? "Part order" : "Garage job"} ${o.ref}` : "Garage job");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reporting, setReporting] = useState(false);

  if (isLoading) return <div style={S.wrap}><p style={bodyText}>Loading…</p></div>;
  if (error || !o) {
    return (
      <div style={S.wrap}>
        <p style={bodyText}>That job or order isn't on your account.</p>
        <Link to="/garage" style={S.link}>Back to garage service</Link>
      </div>
    );
  }

  async function act(key: string, fn: () => Promise<unknown>) {
    setProblem(null);
    setBusy(key);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["garage-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["garage-requests"] });
      setReporting(false);
    } catch (err) {
      setProblem(err instanceof ApiClientError ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const original = o.quotes.find((q) => q.kind === "original");
  const extras = o.quotes.filter((q) => q.kind === "extra");
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["garage-orders", id] });
  const isPart = o.kind === "part";

  return (
    <div style={S.wrap}>
      <Link to={`/garage/requests/${o.request_id}`} style={S.link}>← Your request</Link>
      <div style={{ ...P.mono, marginTop: 18 }}>
        {isPart ? "ORDER" : "JOB"} {o.ref}
        {o.service_type ? ` · ${SERVICE_LABELS[o.service_type].toUpperCase()}` : ""}
        {o.part_name ? ` · ${o.part_name.toUpperCase()}` : ""}
      </div>
      <h1 style={S.h1}>{o.car ? `${carName(o.car)} · ${o.car.plate}` : "Your car"}</h1>
      <p style={{ ...bodyText, fontWeight: 600, color: "#0B0F1A" }}>{orderStatusLabel(o)}</p>
      <p style={{ ...bodyText, maxWidth: 640, marginTop: 4 }}>{whatNext(o)}</p>
      {isPart && o.part_condition && o.fulfilment && (
        <p style={{ ...bodyText, fontSize: 13, marginTop: 8 }}>
          {CONDITION_LABELS[o.part_condition]} part · {FULFILMENT_LABELS[o.fulfilment]}
          {o.fulfilment === "delivered" && o.delivery_address ? ` · ${o.delivery_address}` : ""}
        </p>
      )}
      {o.outlet && (
        <p style={{ ...bodyText, fontSize: 13, marginTop: 8 }}>
          {o.outlet.name}, {o.outlet.address}, {o.outlet.county}
        </p>
      )}

      <div style={{ display: "grid", gap: 14, marginTop: 20 }}>
        <PayPanel order={o} onSent={refresh} />

        {original && <QuoteLines q={original} title="THE QUOTE YOU ACCEPTED" />}

        {extras.map((q) => (
          <QuoteLines key={q.id} q={q} title="EXTRA WORK THE GARAGE FOUND">
            {q.status === "sent" && !q.expired && o.status === "in_progress" && (
              <div style={S.row}>
                <p style={{ ...bodyText, fontSize: 13, flexBasis: "100%" }}>
                  Nothing is added to your bill unless you say yes and pay it. Say no and the garage finishes the original job.
                </p>
                <button type="button" style={P.primary} disabled={!!busy} onClick={() => void act("yes", () => acceptExtraQuote(o.id, q.id))}>
                  {busy === "yes" ? "Saving…" : `Yes, add ${kesText(q.total)}`}
                </button>
                <button type="button" style={P.secondary} disabled={!!busy} onClick={() => void act("no", () => declineExtraQuote(o.id, q.id))}>
                  {busy === "no" ? "Saving…" : "No, thanks"}
                </button>
              </div>
            )}
            {q.status === "accepted" && !q.paid_at && o.payment?.status !== "pending" && (
              <div style={S.row}>
                <button type="button" style={P.danger} disabled={!!busy} onClick={() => void act("no", () => declineExtraQuote(o.id, q.id))}>
                  {busy === "no" ? "Saving…" : "I've changed my mind"}
                </button>
              </div>
            )}
          </QuoteLines>
        ))}

        <div style={{ ...P.card, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...bodyText, fontWeight: 600, color: "#0B0F1A" }}>Paid to CRAL for this {isPart ? "order" : "job"}</span>
          <span style={P.total}>{kesText(o.total)}</span>
        </div>
        {o.payment?.receipt && (
          <p style={{ ...bodyText, fontSize: 13 }}>
            Last M-Pesa receipt <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{o.payment.receipt}</span>
          </p>
        )}
      </div>

      {o.status === "ready" && (
        <div style={{ ...S.row, marginTop: 20 }}>
          <button type="button" style={P.primary} disabled={!!busy} onClick={() => void act("confirm", () => confirmGarageOrder(o.id))}>
            {busy === "confirm" ? "Confirming…" : isPart ? "It's the right part" : "Confirm the job is done"}
          </button>
        </div>
      )}

      {(o.status === "in_progress" || o.status === "ready") && (
        <div style={{ marginTop: 16 }}>
          {!reporting ? (
            <button type="button" style={P.danger} onClick={() => setReporting(true)}>
              {isPart ? "Wrong part" : "Something's wrong"}
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act("problem", () => raiseGarageProblem(o.id, note));
              }}
              style={{ ...P.card, maxWidth: 640 }}
            >
              <label>
                <span style={P.label}>{isPart ? "What's wrong with the part?" : "What's wrong?"}</span>
                <textarea required minLength={10} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} style={P.textarea} />
              </label>
              <p style={{ ...bodyText, fontSize: 12, marginTop: 6 }}>
                CRAL holds your payment while support looks into it. The {isPart ? "order" : "job"} won't confirm itself in the meantime.
              </p>
              <div style={S.row}>
                <button type="submit" style={P.primary} disabled={!!busy}>
                  {busy === "problem" ? "Sending…" : "Send to CRAL support"}
                </button>
                <button type="button" style={P.secondary} onClick={() => setReporting(false)}>
                  Back
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {o.status === "problem" && o.problem_note && (
        <p style={{ ...bodyText, marginTop: 16 }}>You said: &ldquo;{o.problem_note}&rdquo;</p>
      )}
      {o.resolution_note && (o.status === "completed" || o.status === "refunded") && (
        <p style={{ ...bodyText, marginTop: 16 }}>CRAL support: &ldquo;{o.resolution_note}&rdquo;</p>
      )}

      {o.status === "awaiting_payment" && o.payment?.status !== "pending" && (
        <div style={{ marginTop: 24 }}>
          <button type="button" style={P.danger} disabled={!!busy} onClick={() => void act("cancel", () => cancelGarageOrder(o.id))}>
            {busy === "cancel" ? "Cancelling…" : isPart ? "Cancel this order" : "Cancel this job"}
          </button>
          <p style={{ ...bodyText, fontSize: 12, marginTop: 6 }}>Nothing has been charged yet.</p>
        </div>
      )}

      {problem && <p role="alert" style={{ ...bodyText, color: "#A50E22", marginTop: 12 }}>{problem}</p>}
    </div>
  );
}

const S = {
  wrap: { maxWidth: 880, margin: "0 auto", padding: "clamp(24px,4vw,48px) clamp(16px,4vw,40px)" },
  link: { display: "inline-flex", alignItems: "center", minHeight: 44, font: "600 13px/1 'Instrument Sans',sans-serif", color: "#0F23A8", textDecoration: "none" },
  h1: { margin: "6px 0 10px", font: "700 clamp(24px,3.4vw,34px)/1.1 Archivo,sans-serif", fontVariationSettings: "'wdth' 108", letterSpacing: "-.02em", color: "#0B0F1A" },
  row: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 },
} satisfies Record<string, CSSProperties>;

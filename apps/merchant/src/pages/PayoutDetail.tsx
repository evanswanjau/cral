import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { PAYOUT_STATUS, money } from "../components/portal/status.js";
import { Modal } from "../components/portal/Modal.js";
import { useToast } from "../components/portal/Toast.js";
import {
  downloadPayoutReceipt,
  useCreatePayoutQuery,
  usePayout,
  usePayoutQueries,
  type PayoutRunLine,
} from "../lib/payouts-api.js";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
}

function formatRunDate(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function LineRow({ line, onOpen }: { line: PayoutRunLine; onOpen: (line: PayoutRunLine) => void }): JSX.Element {
  const [hover, setHover] = useState(false);
  // A line whose booking has been archived still renders — it is the
  // merchant's payment record — but there is nowhere to navigate to.
  const clickable = line.booking_id !== null;
  return (
    <div
      onClick={() => onOpen(line)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...P.poLineRow,
        cursor: clickable ? "pointer" : "default",
        background: hover && clickable ? "#FAFBFC" : "transparent",
      }}
    >
      <span style={P.poLineRefChip}>{line.booking_ref}</span>
      <div style={{ minWidth: 0 }}>
        <div style={P.poLineHirer}>{line.hirer_name}</div>
        <div style={P.poLineMeta}>
          {line.vehicle_registration} · {formatDay(line.pickup_at)}–{formatDay(line.dropoff_at)}
        </div>
      </div>
      <span style={P.poLineGross}>{money(line.gross.amount)}</span>
      <span style={P.poLineComm}>− {money(line.commission.amount)}</span>
      <span style={P.poLineNet}>{money(line.net.amount)}</span>
      <span style={{ ...P.chevron, opacity: clickable ? 1 : 0.35 }}>›</span>
    </div>
  );
}

export function PayoutDetail(): JSX.Element {
  const { payoutRunId } = useParams<{ payoutRunId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: payout, isLoading } = usePayout(payoutRunId);
  const { data: queries } = usePayoutQueries(payoutRunId);
  const raiseQuery = useCreatePayoutQuery(payoutRunId ?? "");

  const [queryOpen, setQueryOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [downloading, setDownloading] = useState(false);

  if (isLoading || !payout) {
    return (
      <div>
        <button type="button" onClick={() => navigate("/payouts")} style={P.backLink}>
          ← All payouts
        </button>
        <div style={{ ...P.mastCard, height: 180 }} className="cral-shimmer" />
      </div>
    );
  }

  const skin = PAYOUT_STATUS[payout.status];
  // Bound after the loading guard above: a hoisted `function` declaration
  // would not see that narrowing, and `payout` reads as possibly-undefined
  // inside it.
  const run = payout;

  const onReceipt = async (): Promise<void> => {
    setDownloading(true);
    try {
      await downloadPayoutReceipt(run.id, run.ref);
      toast(`Receipt for ${run.ref} downloaded.`, "#0B8A5B");
    } catch {
      toast("That receipt couldn't be prepared. Try again in a moment.", "#D81E32");
    } finally {
      setDownloading(false);
    }
  };

  function onSubmitQuery(): void {
    raiseQuery.mutate(message.trim(), {
      onSuccess: () => {
        setQueryOpen(false);
        setMessage("");
        toast("Query raised — support answers payout queries within one working day.", "#6FC8F0");
      },
      onError: () => toast("That query didn't go through. Try again.", "#D81E32"),
    });
  }

  function openLine(line: PayoutRunLine): void {
    if (line.booking_id) navigate(`/bookings/${line.booking_id}`);
    else toast("That booking has been archived — the payout line is still on your record.", "#8C97A8");
  }

  return (
    <div>
      <button type="button" onClick={() => navigate("/payouts")} style={P.backLink}>
        ← All payouts
      </button>

      <div style={P.mastCard}>
        <div style={P.mastTop}>
          <div>
            <div style={P.mastTagRow}>
              <span style={P.poMastRef}>{payout.ref}</span>
              <span style={{ ...P.poMastStatus, background: skin.tint, border: `1px solid ${skin.border}`, color: skin.text }}>
                <span style={{ ...P.mastStatusDot, background: skin.core }} />
                {skin.label}
              </span>
            </div>
            <div style={P.poMastAmount}>
              <span style={P.poMastUnit}>KES</span> {money(payout.net.amount)}
            </div>
            <div style={P.mastSub}>
              {payout.status === "paid"
                ? `Sent to M-Pesa ${payout.destination.detail} on ${formatRunDate(payout.run_date)}.`
                : `Scheduled to leave on ${formatRunDate(payout.run_date)}, to M-Pesa ${payout.destination.detail}.`}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={P.mastRefLabel}>M-PESA CODE</div>
            <div style={P.poCodeChip}>{payout.provider_code ?? "PENDING RUN"}</div>
          </div>
        </div>

        <div style={P.mastActions}>
          <button type="button" onClick={onReceipt} disabled={downloading} style={P.actionBtn}>
            {downloading ? "Preparing…" : "Download receipt"}
          </button>
          <button type="button" onClick={() => setQueryOpen(true)} style={P.actionBtn}>
            Query this payout
          </button>
        </div>
      </div>

      <div style={{ ...P.card, marginBottom: 16 }}>
        <div style={P.cardHead}>
          <span style={P.cardTitle}>Bookings in this payout</span>
          <span style={{ ...P.cardHeadTag, color: "#838C9B" }}>
            {payout.lines.length} {payout.lines.length === 1 ? "LINE" : "LINES"}
          </span>
        </div>

        {payout.lines.map((line) => (
          <LineRow key={line.id} line={line} onOpen={openLine} />
        ))}

        <div style={P.poTotals}>
          <div style={P.poTotalRow}>
            <span style={P.poTotalKey}>Gross bookings</span>
            <span style={{ ...P.poTotalVal, color: "#0B0F1A" }}>KES {money(payout.gross.amount)}</span>
          </div>
          <div style={P.poTotalRow}>
            <span style={P.poTotalKey}>CRAL commission · 10%</span>
            <span style={{ ...P.poTotalVal, color: "#A50E22" }}>− KES {money(payout.commission.amount)}</span>
          </div>
          <div style={P.poTotalRow}>
            <span style={P.poTotalNetKey}>Net to M-Pesa</span>
            <span style={P.poTotalNetVal}>KES {money(payout.net.amount)}</span>
          </div>
        </div>
      </div>

      <div style={P.poFootnote}>
        <span style={P.poFootnoteRule} />
        <span style={P.poFootnoteText}>{payout.footnote}</span>
      </div>

      {queries && queries.data.length > 0 && (
        <div style={{ ...P.card, marginTop: 16 }}>
          <div style={P.cardHead}>
            <span style={P.cardTitle}>Your queries</span>
            <span style={{ ...P.cardHeadTag, color: "#838C9B" }}>{queries.data.length}</span>
          </div>
          {queries.data.map((q) => (
            <div key={q.id} style={P.docRow}>
              <span
                style={{
                  ...P.docRowDot,
                  background: q.status === "answered" ? "#0B8A5B" : "#C77400",
                }}
              />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={P.docRowTitle}>{q.message}</div>
                <div style={{ ...P.docRowSub, color: "#838C9B" }}>
                  {q.status === "answered" ? (q.response ?? "Answered by CRAL support.") : "With CRAL support."}
                </div>
              </div>
              <span style={{ ...P.docRowState, color: q.status === "answered" ? "#076945" : "#8A5200" }}>
                {q.status === "answered" ? "ANSWERED" : "OPEN"}
              </span>
            </div>
          ))}
        </div>
      )}

      {queryOpen && (
        <Modal
          title="Query this payout"
          sub={`Tell us what looks wrong with ${payout.ref}. Support answers payout queries within one working day.`}
          onClose={() => setQueryOpen(false)}
          onConfirm={onSubmitQuery}
          ctaLabel={raiseQuery.isPending ? "Sending…" : "Raise query"}
          ctaDisabled={message.trim().length === 0 || raiseQuery.isPending}
        >
          <label style={P.fieldLabel} htmlFor="payout-query">
            What looks wrong?
          </label>
          <textarea
            id="payout-query"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            placeholder="e.g. CB-2811 shows a commission of KES 1,680 but the booking said KES 1,200."
            style={P.textarea}
          />
          <p style={{ ...P.helperText, marginTop: 8 }}>
            We'll look at the run and the bookings behind it. Nothing on this payout changes while a query is open.
          </p>
        </Modal>
      )}
    </div>
  );
}

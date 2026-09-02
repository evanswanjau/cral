import { useState } from "react";
import { P } from "../../components/portal/styles.js";
import { money } from "../../components/portal/status.js";
import { useToast } from "../../components/portal/Toast.js";
import { ApiClientError } from "../../lib/api.js";
import { downloadStatement } from "../../lib/payouts-api.js";
import { useProfile } from "../../lib/settings-api.js";
import { useStatements } from "../../lib/settings-api.js";

/**
 * Settings → Payouts. Read-only. Deliberate deviations from the design
 * (confirmed — see CLAUDE.md's Settings decisions):
 *  - "Where your money lands" ships read-only. There is no payment rail,
 *    and Daraja B2C pays M-Pesa not banks, so an editable destination could
 *    select something nothing can ever disburse to. Changing it is a
 *    contact-CRAL step until a rail exists.
 *  - The statement is CSV, not PDF (2026-09-01 decision) — the card tag
 *    says so.
 *  - No long-booking instalment rhythm control. Nothing implements
 *    instalments; a stored preference would change nothing.
 */
export function PayoutsTab(): JSX.Element {
  const { data: profile } = useProfile();
  const { data: statements, isLoading } = useStatements();

  return (
    <div style={P.setBodyWrap}>
      <div style={P.setBodyMain}>
        <div style={P.setCard}>
          <div style={P.setCardHead}>
            <div style={P.setCardTitle}>Where your money lands</div>
            <div style={P.setCardSub}>
              Payouts go to your M-Pesa line. It must be in your own name or the registered company
              name.
            </div>
          </div>
          <div style={P.setFieldStack}>
            <div style={P.setReadRow}>
              <span>Method</span>
              <span style={P.setReadVal}>M-Pesa</span>
            </div>
            <div style={P.setReadRow}>
              <span>M-Pesa number</span>
              <span style={P.setReadVal}>
                {profile?.phone ?? "—"}
                {profile?.phone_verified ? (
                  <span style={{ ...P.setChip, ...P.setChipOk, marginLeft: 8 }}>✓ VERIFIED</span>
                ) : null}
              </span>
            </div>
            <div style={P.setInlineNote}>
              Bank payouts and changing your payout destination aren&rsquo;t available yet — contact
              CRAL to update these.
            </div>
          </div>
        </div>

        <div style={P.setCard}>
          <div style={P.setCardHeadRow}>
            <span style={P.setCardTitle}>Statements</span>
            <span style={P.setCardHeadTag}>NET OF COMMISSION · CSV</span>
          </div>
          {isLoading ? (
            <div style={{ padding: 18, font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" }}>
              Loading…
            </div>
          ) : !statements || statements.data.length === 0 ? (
            <div style={P.setCardFoot}>No payouts yet. Statements appear here once a run is paid.</div>
          ) : (
            statements.data.map((s) => <StatementRow key={s.month} month={s.month} label={s.label} amount={s.net.amount} />)
          )}
        </div>
      </div>

      <div style={P.setBodySide}>
        <div style={P.setCard}>
          <div style={{ ...P.setCardHead, ...P.setCardTitle }}>Fees and deposits</div>
          <div style={P.setFeeBody}>
            <div style={P.setReadRow}>
              <span>Payout fee</span>
              <span style={P.setReadVal}>None</span>
            </div>
            <div style={P.setReadRow}>
              <span>Security deposit</span>
              <span style={{ ...P.setReadVal, color: "#838C9B" }}>Held by CRAL</span>
            </div>
          </div>
          <div style={P.setCardFoot}>
            Deposits are returned to the hirer after the return check. They never pass through your
            payout.
          </div>
        </div>

        <div style={P.setPaidCard}>
          <div style={P.setPaidKickerRow}>
            <span style={P.setPaidRule} />
            <span style={P.setPaidKicker}>WHEN YOU GET PAID</span>
          </div>
          <div style={P.setPaidTitle}>On completion, every time</div>
          <p style={P.setPaidBody}>
            Hirers pay CRAL upfront. Your payout clears 24 hours after you receive the vehicle, then
            leaves on the next run.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatementRow({
  month,
  label,
  amount,
}: {
  month: string;
  label: string;
  amount: number;
}): JSX.Element {
  const flash = useToast();
  const [busy, setBusy] = useState(false);

  async function download(): Promise<void> {
    setBusy(true);
    try {
      await downloadStatement(month);
    } catch (e) {
      flash(e instanceof ApiClientError ? e.message : "Couldn't build that statement.", "#D81E32");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={P.setListRow}>
      <span style={{ ...P.setListName, flex: 1, minWidth: 120 }}>{label}</span>
      <span
        style={{
          font: "600 13px/1.3 'Instrument Sans',sans-serif",
          color: "#0B0F1A",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        KES {money(amount)}
      </span>
      <button type="button" style={P.setSmallBtn} onClick={() => void download()} disabled={busy}>
        {busy ? "…" : "Download"}
      </button>
    </div>
  );
}

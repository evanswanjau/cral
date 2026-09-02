import { useMemo, useState } from "react";
import { P } from "../../components/portal/styles.js";
import { money } from "../../components/portal/status.js";
import { SaveBar } from "../../components/portal/SaveBar.js";
import { useToast } from "../../components/portal/Toast.js";
import { OptionCard, Select } from "../../components/onboarding/primitives.js";
import { O } from "../../components/onboarding/styles.js";
import { BANKS } from "../../lib/kenya.js";
import { ApiClientError } from "../../lib/api.js";
import { downloadStatement } from "../../lib/payouts-api.js";
import {
  useProfile,
  useStatements,
  useUpdatePayoutSettings,
  type MerchantProfile,
  type PayoutSettingsInput,
} from "../../lib/settings-api.js";

/**
 * Settings → Payouts, per "Cruz Merchant Settings.dc.html". Editable as of
 * 2026-09-03 (owner's call): the merchant picks the method, fills the
 * M-Pesa or bank details, and sets the long-booking rhythm.
 *
 * There is still no payment rail — nothing disburses against any of this.
 * The bank fields and `schedule` are collected and stored for when one
 * exists. **Company merchants are locked to Bank** (M-Pesa disabled),
 * mirroring onboarding; the server rejects `mpesa` for a company too.
 *
 * The statement download stays CSV (the receipt-is-PDF / statement-is-CSV
 * decision from 2026-09-01).
 */

type Draft = {
  method: PayoutSettingsInput["method"];
  schedule: PayoutSettingsInput["schedule"];
  same_as_phone: boolean;
  mpesa_number: string;
  mpesa_name: string;
  bank_name: string;
  bank_branch: string;
  bank_account_name: string;
  bank_account_number: string;
};

function toDraft(p: MerchantProfile): Draft {
  const py = p.payout;
  return {
    method: py.method,
    schedule: py.schedule,
    same_as_phone: py.same_as_phone,
    mpesa_number: py.same_as_phone ? "" : py.mpesa_number ?? "",
    mpesa_name: py.mpesa_name ?? "",
    bank_name: py.bank_name ?? "",
    bank_branch: py.bank_branch ?? "",
    bank_account_name: py.bank_account_name ?? "",
    bank_account_number: py.bank_account_number ?? "",
  };
}

function toPayload(d: Draft): PayoutSettingsInput {
  if (d.method === "bank") {
    return {
      method: "bank",
      schedule: d.schedule,
      bank_name: d.bank_name,
      bank_branch: d.bank_branch,
      bank_account_name: d.bank_account_name,
      bank_account_number: d.bank_account_number,
    };
  }
  return {
    method: "mpesa",
    schedule: d.schedule,
    same_as_phone: d.same_as_phone,
    ...(d.same_as_phone ? {} : { mpesa_number: d.mpesa_number }),
    mpesa_name: d.mpesa_name,
  };
}

const SCHEDULES = [
  {
    key: "weekly" as const,
    label: "Every Monday",
    body: "The default. One instalment a week, Monday morning, for every long booking still running.",
  },
  {
    key: "monthly" as const,
    label: "Monthly, on the 1st",
    body: "One instalment a month. Fewer transfers to reconcile on a long contract.",
  },
];

export function PayoutsTab(): JSX.Element {
  const toast = useToast();
  const { data: profile, isLoading } = useProfile();
  const { data: statements, isLoading: loadingStatements } = useStatements();
  const save = useUpdatePayoutSettings();

  const base = useMemo(() => (profile ? toDraft(profile) : null), [profile]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const current = draft ?? base;

  if (isLoading || !profile || !base || !current) {
    return <div style={{ ...P.card, padding: 20 }}>Loading…</div>;
  }

  const isCompany = profile.owner_type === "company";
  const payByBank = current.method === "bank";
  const dirty = JSON.stringify(base) !== JSON.stringify(current);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft({ ...(draft ?? base), [k]: v });

  const mpesaShown = current.same_as_phone ? profile.phone ?? "" : current.mpesa_number;
  const mpesaVerified = current.same_as_phone
    ? profile.phone_verified
    : Boolean(mpesaShown) && mpesaShown === profile.phone && profile.phone_verified;

  async function onSave(): Promise<void> {
    try {
      await save.mutateAsync(toPayload(current!));
      setDraft(null);
      toast("Payout settings saved.", "#0B8A5B");
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "Couldn't save that. Try again.", "#D81E32");
    }
  }

  return (
    <>
      <div style={P.setBodyWrap}>
        <div style={P.setBodyMain}>
          <div style={P.setCard}>
            <div style={P.setCardHead}>
              <div style={P.setCardTitle}>Where your money lands</div>
              <div style={P.setCardSub}>
                {isCompany
                  ? "Companies are paid to a bank account in the registered company name."
                  : "M-Pesa or a bank account. Either one must be in your own name."}
              </div>
            </div>
            <div style={P.setFieldStack}>
              <div>
                <span style={P.setFieldLabel}>Payout method</span>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 220px" }}>
                    <OptionCard
                      active={!payByBank}
                      disabled={isCompany}
                      title="M-Pesa"
                      body={isCompany ? "Not available for companies" : "Same day, to a Safaricom line"}
                      onClick={() => set("method", "mpesa")}
                    />
                  </div>
                  <div style={{ flex: "1 1 220px" }}>
                    <OptionCard
                      active={payByBank}
                      title="Bank account"
                      body="Any bank in Kenya · 1–2 working days"
                      onClick={() => set("method", "bank")}
                    />
                  </div>
                </div>
              </div>

              {payByBank ? (
                <>
                  <div style={P.setFieldGrid2}>
                    <label style={P.setField}>
                      <span style={P.setFieldLabel}>Bank</span>
                      <Select value={current.bank_name} onChange={(e) => set("bank_name", e.target.value)}>
                        <option value="">Select a bank</option>
                        {BANKS.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label style={P.setField}>
                      <span style={P.setFieldLabel}>Branch</span>
                      <input style={P.setInput} value={current.bank_branch} onChange={(e) => set("bank_branch", e.target.value)} placeholder="Westlands" />
                    </label>
                    <label style={P.setField}>
                      <span style={P.setFieldLabel}>Name on the account</span>
                      <input
                        style={P.setInput}
                        value={current.bank_account_name}
                        onChange={(e) => set("bank_account_name", e.target.value)}
                        placeholder={isCompany ? profile.company_name ?? "Company name" : "Your name"}
                      />
                    </label>
                    <label style={P.setField}>
                      <span style={P.setFieldLabel}>Account number</span>
                      <input
                        style={P.setInputMono}
                        value={current.bank_account_number}
                        inputMode="numeric"
                        onChange={(e) => set("bank_account_number", e.target.value.replace(/[^\d]/g, ""))}
                      />
                    </label>
                  </div>
                  <div style={P.setInlineNote}>
                    {isCompany
                      ? `The account must be in the name of ${profile.company_name?.trim() || "your company"}. We cannot pay a company's earnings to a personal or third-party account.`
                      : "The account must be in your own name. We cannot pay your earnings into someone else's account."}
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => set("same_as_phone", !current.same_as_phone)}
                    style={{ ...O.checkChip, ...(current.same_as_phone ? O.checkChipOn : {}) }}
                  >
                    <span
                      style={{
                        ...O.checkChipBox,
                        background: current.same_as_phone ? "#0B8A5B" : "#CDD2DA",
                      }}
                    >
                      {current.same_as_phone ? "✓" : ""}
                    </span>
                    Same as my phone number
                  </button>
                  <div style={P.setFieldGrid2}>
                    <label style={P.setField}>
                      <span style={P.setFieldLabelRow}>
                        M-Pesa number
                        {mpesaShown ? (
                          <span
                            style={{ ...P.setChip, ...(mpesaVerified ? P.setChipOk : P.setChipWarn) }}
                          >
                            {mpesaVerified ? "✓ VERIFIED" : "UNVERIFIED"}
                          </span>
                        ) : null}
                      </span>
                      <input
                        style={{
                          ...P.setInputMono,
                          ...(current.same_as_phone ? { background: "#F8F9FB", color: "#838C9B" } : {}),
                        }}
                        value={mpesaShown}
                        disabled={current.same_as_phone}
                        inputMode="tel"
                        onChange={(e) => set("mpesa_number", e.target.value)}
                        placeholder="+254…"
                      />
                    </label>
                    <label style={P.setField}>
                      <span style={P.setFieldLabel}>Name on the M-Pesa line</span>
                      <input
                        style={P.setInput}
                        value={current.mpesa_name}
                        onChange={(e) => set("mpesa_name", e.target.value)}
                        placeholder="As registered on the line"
                      />
                    </label>
                  </div>
                </>
              )}

              <div>
                <span style={P.setFieldLabel}>Long bookings</span>
                <p style={{ margin: "0 0 10px", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", maxWidth: "64ch", textWrap: "pretty" }}>
                  Ordinary hires pay out on completion, 24 hours after you receive the vehicle. Only
                  bookings of a month or longer pay in instalments — pick the rhythm.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>
                  {SCHEDULES.map((o) => (
                    <OptionCard
                      key={o.key}
                      active={current.schedule === o.key}
                      title={o.label}
                      body={o.body}
                      onClick={() => set("schedule", o.key)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={P.setCard}>
            <div style={P.setCardHeadRow}>
              <span style={P.setCardTitle}>Statements</span>
              <span style={P.setCardHeadTag}>NET OF COMMISSION · CSV</span>
            </div>
            {loadingStatements ? (
              <div style={{ padding: 18, font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" }}>
                Loading…
              </div>
            ) : !statements || statements.data.length === 0 ? (
              <div style={P.setCardFoot}>No payouts yet. Statements appear here once a run is paid.</div>
            ) : (
              statements.data.map((s) => (
                <StatementRow key={s.month} month={s.month} label={s.label} amount={s.net.amount} />
              ))
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
              leaves on the next run. Only long bookings follow the rhythm you set.
            </p>
          </div>
        </div>
      </div>

      {dirty && <SaveBar onSave={onSave} onDiscard={() => setDraft(null)} saving={save.isPending} />}
    </>
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

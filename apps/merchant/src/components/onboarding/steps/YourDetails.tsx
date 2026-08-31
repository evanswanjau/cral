import { useState } from "react";
// Per-icon subpaths, not the package barrel - the barrel pulls in the whole
// ~9,000-icon set and stalls Vite's dev optimiser.
import { Buildings } from "@phosphor-icons/react/dist/ssr/Buildings";
import { User } from "@phosphor-icons/react/dist/ssr/User";
import { Wallet } from "@phosphor-icons/react/dist/ssr/Wallet";
import { O } from "../styles.js";
import { BackButton, FormField, OptionCard, PrimaryButton, Select, TextInput } from "../primitives.js";
import { BANKS } from "../../../lib/kenya.js";
import type { OnboardingDraft } from "../../../lib/onboarding-draft.js";

/** Solid (filled) Phosphor marks, white on the blue section badges. */
const ICON = { size: 20, weight: "fill", color: "#FFFFFF" } as const;

function PhoneInput({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: boolean;
}): JSX.Element {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={O.phonePrefix}>+254</span>
      <TextInput
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        placeholder="712 345 678"
        inputMode="tel"
        style={{ flex: 1, ...(disabled ? O.inputDisabled : {}) }}
        error={error}
      />
    </div>
  );
}

export function YourDetails({
  draft,
  onChange,
  onBack,
  onContinue,
}: {
  draft: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
  onBack: () => void;
  onContinue: () => void;
}): JSX.Element {
  const [showErrors, setShowErrors] = useState(false);
  const isCompany = draft.ownerType === "company";
  // Companies can only be paid to a bank account in the company name.
  const payByBank = isCompany || draft.payoutMethod === "bank";

  const req = (v: string) => (showErrors && !v.trim() ? "Required." : undefined);

  const bankFilled =
    draft.bankName.trim() &&
    draft.bankBranch.trim() &&
    draft.bankAccountName.trim() &&
    draft.bankAccountNumber.trim();
  const payoutFilled = payByBank
    ? bankFilled
    : (draft.payoutSame ? draft.phone : draft.payoutDetail).trim();

  const requiredFilled =
    draft.firstName.trim() &&
    draft.surname.trim() &&
    draft.nationalId.trim() &&
    draft.kraPin.trim() &&
    draft.phone.trim() &&
    payoutFilled &&
    (!isCompany || (draft.companyName.trim() && draft.certNo.trim() && draft.companyKra.trim()));

  function pickOwnerType(type: OnboardingDraft["ownerType"]) {
    // Switching to a company forces the bank path; switching back restores
    // M-Pesa rather than leaving a method the individual can't use.
    onChange({ ownerType: type, payoutMethod: type === "company" ? "bank" : "mpesa" });
  }

  function handleContinue() {
    if (!requiredFilled) {
      setShowErrors(true);
      return;
    }
    onContinue();
  }

  return (
    <div style={O.wDetails}>
      <div style={O.stepEyebrow}>STEP 2 OF 5</div>
      <h1 style={O.h1Step}>Your details</h1>
      <p style={{ ...O.stepLede, marginBottom: 20 }}>
        These must match your National ID and logbook exactly - a mismatch is the most common
        reason a listing is sent back.
      </p>

      <div style={O.card}>
        <div style={{ ...O.cardTitle, marginBottom: 14 }}>Who&rsquo;s listing?</div>
        <div style={O.optionGrid}>
          <OptionCard
            active={!isCompany}
            title="Individual owner"
            body="Your own vehicle or two"
            onClick={() => pickOwnerType("individual")}
          />
          <OptionCard
            active={isCompany}
            title="Registered company"
            body="A fleet under one account"
            onClick={() => pickOwnerType("company")}
          />
        </div>
      </div>

      {isCompany && (
        <div style={O.section}>
          <div style={O.sectionHead}>
            <div style={O.sectionHeadLeft}>
              <span style={O.sectionBadgeSquare}>
                <Buildings {...ICON} />
              </span>
              <div>
                <div style={O.sectionTitle}>Company details</div>
                <div style={O.sectionSub}>As registered with the Registrar of Companies</div>
              </div>
            </div>
            <span style={O.sectionAside}>COMPANY</span>
          </div>
          <div style={O.sectionBody}>
            <div style={O.formGrid3}>
              <FormField label="Company name" required error={req(draft.companyName)} helper="As registered with the Registrar of Companies.">
                <TextInput
                  value={draft.companyName}
                  onChange={(e) => onChange({ companyName: e.target.value })}
                  placeholder="Barabara Fleet Ltd"
                  error={showErrors && !draft.companyName.trim()}
                />
              </FormField>
              <FormField label="Certificate of incorporation" required error={req(draft.certNo)} helper="From the certificate of incorporation.">
                <TextInput
                  value={draft.certNo}
                  onChange={(e) => onChange({ certNo: e.target.value })}
                  placeholder="CPR/2020/123456"
                  error={showErrors && !draft.certNo.trim()}
                />
              </FormField>
              <FormField label="Company KRA PIN" required error={req(draft.companyKra)} helper="The company PIN, not your personal one.">
                <TextInput
                  value={draft.companyKra}
                  onChange={(e) => onChange({ companyKra: e.target.value.toUpperCase() })}
                  placeholder="P051234567X"
                  error={showErrors && !draft.companyKra.trim()}
                />
              </FormField>
            </div>
          </div>
        </div>
      )}

      <div style={O.section}>
        <div style={O.sectionHead}>
          <div style={O.sectionHeadLeft}>
            <span style={O.sectionBadge}>
              <User {...ICON} />
            </span>
            <div>
              <div style={O.sectionTitle}>{isCompany ? "Contact person" : "Owner details"}</div>
              <div style={O.sectionSub}>
                {isCompany
                  ? "The person we deal with - their own ID and PIN"
                  : "Exactly as written on your National ID"}
              </div>
            </div>
          </div>
        </div>

        <div style={O.sectionBody}>
          <div style={{ ...O.formGrid3, marginBottom: 18 }}>
            <FormField label="First name" required error={req(draft.firstName)} helper="Exactly as on the National ID.">
              <TextInput value={draft.firstName} onChange={(e) => onChange({ firstName: e.target.value })} placeholder="John" error={showErrors && !draft.firstName.trim()} />
            </FormField>
            <FormField label="Middle name" helper="Only if it appears on the ID.">
              <TextInput value={draft.middleName} onChange={(e) => onChange({ middleName: e.target.value })} placeholder="Baraka" />
            </FormField>
            <FormField label="Surname" required error={req(draft.surname)} helper="Exactly as on the National ID.">
              <TextInput value={draft.surname} onChange={(e) => onChange({ surname: e.target.value })} placeholder="Amani" error={showErrors && !draft.surname.trim()} />
            </FormField>
          </div>

          <div style={{ ...O.formGrid3, marginBottom: 18 }}>
            <FormField label="National ID number" required error={req(draft.nationalId)} helper="Checked against the logbook.">
              <TextInput value={draft.nationalId} onChange={(e) => onChange({ nationalId: e.target.value.replace(/\D/g, "") })} placeholder="12345678" error={showErrors && !draft.nationalId.trim()} />
            </FormField>
            <FormField label="KRA PIN" required error={req(draft.kraPin)} helper="From your KRA PIN certificate.">
              <TextInput value={draft.kraPin} onChange={(e) => onChange({ kraPin: e.target.value.toUpperCase() })} placeholder="A012345678Z" error={showErrors && !draft.kraPin.trim()} />
            </FormField>
            <FormField label="Phone number" required error={req(draft.phone)} helper="How we reach you about your listing.">
              <PhoneInput
                value={draft.phone}
                onChange={(v) => onChange({ phone: v })}
                error={showErrors && !draft.phone.trim()}
              />
            </FormField>
          </div>

          <div style={O.formGrid3}>
            <FormField label="Email" required helper="This is the email on your CRAL account - receipts and payout statements go here.">
              <TextInput value={draft.email} disabled style={O.inputDisabled} />
            </FormField>
          </div>
        </div>
      </div>

      <div style={O.section}>
        <div style={O.sectionHead}>
          <div style={O.sectionHeadLeft}>
            <span style={O.sectionBadgeSquare}>
                <Wallet {...ICON} />
              </span>
            <div>
              <div style={O.sectionTitle}>Payout account</div>
              <div style={O.sectionSub}>
                {isCompany
                  ? "Companies are paid to a bank account in the company name"
                  : "Where your money goes after every completed hire"}
              </div>
            </div>
          </div>
          <span style={O.sectionAside}>PAYOUTS</span>
        </div>

        <div style={O.sectionBody}>
          <div style={{ ...O.label, marginBottom: 12 }}>How should we pay you?</div>
          <div style={O.optionGrid}>
            <OptionCard
              active={!payByBank}
              disabled={isCompany}
              title="M-Pesa"
              body={isCompany ? "Not available for companies" : "Same-day, to a Safaricom line"}
              onClick={() => onChange({ payoutMethod: "mpesa" })}
            />
            <OptionCard
              active={payByBank}
              title="Bank account"
              body="Any bank in Kenya · 1–2 working days"
              onClick={() => onChange({ payoutMethod: "bank" })}
            />
          </div>

          <p style={{ ...O.helper, marginTop: 12, marginBottom: 18 }}>
            {isCompany
              ? "Registered companies are paid by bank transfer only - the account must be in the company name so it matches your KRA records."
              : payByBank
                ? "Bank transfers land in one to two working days. The account must be in your own name."
                : "M-Pesa arrives the same day, within the Safaricom daily limit."}
          </p>

          {payByBank ? (
            <>
              <div style={{ ...O.formGrid3, marginBottom: 18 }}>
                <FormField label="Bank" required error={req(draft.bankName)} helper="The bank holding the account.">
                  <Select value={draft.bankName} onChange={(e) => onChange({ bankName: e.target.value })}>
                    <option value="">Select a bank</option>
                    {BANKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Branch" required error={req(draft.bankBranch)} helper="Branch where the account was opened.">
                  <TextInput
                    value={draft.bankBranch}
                    onChange={(e) => onChange({ bankBranch: e.target.value })}
                    placeholder="Westlands"
                    error={showErrors && !draft.bankBranch.trim()}
                  />
                </FormField>
                <FormField label="Name on the account" required error={req(draft.bankAccountName)} helper="Must match the owner or company name.">
                  <TextInput
                    value={draft.bankAccountName}
                    onChange={(e) => onChange({ bankAccountName: e.target.value })}
                    placeholder={isCompany ? draft.companyName || "Barabara Fleet Ltd" : "John Amani"}
                    error={showErrors && !draft.bankAccountName.trim()}
                  />
                </FormField>
              </div>

              <div style={{ ...O.formGrid3, marginBottom: 18 }}>
                <FormField label="Account number" required error={req(draft.bankAccountNumber)} helper="Digits only, as printed on your statement.">
                  <TextInput
                    value={draft.bankAccountNumber}
                    onChange={(e) => onChange({ bankAccountNumber: e.target.value.replace(/\D/g, "") })}
                    placeholder="1234567890"
                    inputMode="numeric"
                    error={showErrors && !draft.bankAccountNumber.trim()}
                  />
                </FormField>
              </div>

              <div style={O.noteBox}>
                {isCompany ? (
                  <>
                    The account must be in the name of {draft.companyName.trim() || "your company"}.
                    We cannot pay a company&rsquo;s earnings to a personal or third-party account.
                  </>
                ) : (
                  <>We cannot pay your earnings into someone else&rsquo;s account.</>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onChange({ payoutSame: !draft.payoutSame })}
                style={{ ...O.checkChip, ...(draft.payoutSame ? O.checkChipOn : {}) }}
              >
                <span style={{ ...O.checkChipBox, background: draft.payoutSame ? "#0B8A5B" : "#CDD2DA" }}>
                  {draft.payoutSame ? "✓" : ""}
                </span>
                Same as my phone number
              </button>

              <FormField
                label="M-Pesa payout number"
                required
                error={showErrors && !(draft.payoutSame ? draft.phone : draft.payoutDetail).trim() ? "Required." : undefined}
                helper="Where your earnings are sent."
              >
                <PhoneInput
                  value={draft.payoutSame ? draft.phone : draft.payoutDetail}
                  disabled={draft.payoutSame}
                  onChange={(v) => onChange({ payoutDetail: v })}
                  error={showErrors && !draft.payoutSame && !draft.payoutDetail.trim()}
                />
              </FormField>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <BackButton onClick={onBack}>← Back</BackButton>
        <PrimaryButton onClick={handleContinue}>Continue to vehicles</PrimaryButton>
      </div>
    </div>
  );
}

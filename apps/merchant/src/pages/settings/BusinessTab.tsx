import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { P } from "../../components/portal/styles.js";
import { DOC_STATE } from "../../components/portal/status.js";
import { SaveBar } from "../../components/portal/SaveBar.js";
import { useToast } from "../../components/portal/Toast.js";
import { FormField, PrimaryButton, TextInput } from "../../components/onboarding/primitives.js";
import { O } from "../../components/onboarding/styles.js";
import { ApiClientError, apiBlob } from "../../lib/api.js";
import { confirmPhoneVerification, startPhoneVerification } from "../../lib/onboarding-draft.js";
import {
  useProfile,
  useUpdateProfile,
  type MerchantProfile,
  type MerchantProfilePatch,
} from "../../lib/settings-api.js";

/**
 * Settings → Business. Edits the merchant's profile after onboarding.
 *
 * Deliberate deviations from "Cruz Merchant Settings.dc.html" (all
 * confirmed — see CLAUDE.md's Settings decisions):
 *  - No "County" select. `merchants.county` was dropped on 2026-08-31;
 *    county lives on the vehicle now.
 *  - "Business type" is the two-value `owner_type` axis relabelled, not a
 *    new three-way field. "Partnership" is dropped.
 *  - No WhatsApp toggle — consistent with the Alerts matrix dropping the
 *    WhatsApp column.
 *  - "Business documents" is a read-only view of the account-level owner
 *    docs. Certificate-of-incorporation / CR12 upload is deferred with the
 *    People tab.
 */

type Draft = {
  owner_type: MerchantProfile["owner_type"];
  trading_name: string;
  company_name: string;
  company_kra: string;
  company_email: string;
  company_address: string;
  first_name: string;
  surname: string;
  kra_pin: string;
  phone: string;
};

function toDraft(p: MerchantProfile): Draft {
  return {
    owner_type: p.owner_type,
    trading_name: p.trading_name ?? "",
    company_name: p.company_name ?? "",
    company_kra: p.company_kra ?? "",
    company_email: p.company_email ?? "",
    company_address: p.company_address ?? "",
    first_name: p.first_name ?? "",
    surname: p.surname ?? "",
    kra_pin: p.kra_pin ?? "",
    phone: p.phone ?? "",
  };
}

/** Only the fields that actually changed, mapped to the PATCH body. */
function diffPatch(base: Draft, draft: Draft): MerchantProfilePatch {
  const patch: MerchantProfilePatch = {};
  (Object.keys(draft) as Array<keyof Draft>).forEach((k) => {
    if (draft[k] !== base[k]) (patch as Record<string, unknown>)[k] = draft[k];
  });
  return patch;
}

export function BusinessTab(): JSX.Element {
  const toast = useToast();
  const { data: profile, isLoading } = useProfile();
  const save = useUpdateProfile();

  const base = useMemo(() => (profile ? toDraft(profile) : null), [profile]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const current = draft ?? base;

  if (isLoading || !profile || !base || !current) {
    return <div style={{ ...P.card, padding: 20 }}>Loading…</div>;
  }

  const isCompany = current.owner_type === "company";
  const patch = diffPatch(base, current);
  const dirty = Object.keys(patch).length > 0;
  const set = (k: keyof Draft, v: string) =>
    setDraft({ ...(draft ?? base), [k]: v } as Draft);

  async function onSave(): Promise<void> {
    try {
      await save.mutateAsync(patch);
      setDraft(null);
      toast("Business details saved.", "#0B8A5B");
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "Couldn't save that. Try again.", "#D81E32");
    }
  }

  return (
    <>
      <div style={P.setBodyWrap}>
        <div style={P.setBodyMain}>
          {/* Business details */}
          <div style={P.setCard}>
            <div style={P.setCardHead}>
              <div style={P.setCardTitle}>Business details</div>
              <div style={P.setCardSub}>
                This is the name hirers see on a listing and the name that must match your logbooks.
              </div>
            </div>
            <div style={P.setFieldGrid}>
              {isCompany ? (
                <label style={P.setField}>
                  <span style={P.setFieldLabel}>Registered business name</span>
                  <input
                    style={P.setInput}
                    value={current.company_name}
                    onChange={(e) => set("company_name", e.target.value)}
                  />
                </label>
              ) : (
                <>
                  <label style={P.setField}>
                    <span style={P.setFieldLabel}>First name</span>
                    <input
                      style={P.setInput}
                      value={current.first_name}
                      onChange={(e) => set("first_name", e.target.value)}
                    />
                  </label>
                  <label style={P.setField}>
                    <span style={P.setFieldLabel}>Surname</span>
                    <input
                      style={P.setInput}
                      value={current.surname}
                      onChange={(e) => set("surname", e.target.value)}
                    />
                  </label>
                </>
              )}
              <label style={P.setField}>
                <span style={P.setFieldLabel}>Trading name</span>
                <input
                  style={P.setInput}
                  value={current.trading_name}
                  onChange={(e) => set("trading_name", e.target.value)}
                  placeholder="If different from the registered name"
                />
              </label>
              <label style={P.setField}>
                <span style={P.setFieldLabel}>KRA PIN</span>
                <input
                  style={P.setInputMono}
                  value={isCompany ? current.company_kra : current.kra_pin}
                  onChange={(e) => set(isCompany ? "company_kra" : "kra_pin", e.target.value)}
                />
              </label>
              <label style={P.setField}>
                <span style={P.setFieldLabel}>Business type</span>
                <select
                  style={P.setSelect}
                  value={current.owner_type}
                  onChange={(e) => set("owner_type", e.target.value)}
                >
                  <option value="individual">Sole proprietor</option>
                  <option value="company">Limited company</option>
                </select>
              </label>
              <label style={P.setField}>
                <span style={P.setFieldLabel}>Yard or office address</span>
                <input
                  style={P.setInput}
                  value={current.company_address}
                  onChange={(e) => set("company_address", e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* How CRAL reaches you */}
          <div style={P.setCard}>
            <div style={P.setCardHead}>
              <div style={P.setCardTitle}>How CRAL reaches you</div>
              <div style={P.setCardSub}>
                Booking alerts and reviewer notes go to these. Hirers never see them.
              </div>
            </div>
            <div style={P.setFieldGrid}>
              <label style={P.setField}>
                <span style={P.setFieldLabelRow}>
                  Phone number
                  {profile.phone ? (
                    <span
                      style={{
                        ...P.setChip,
                        ...(profile.phone_verified ? P.setChipOk : P.setChipWarn),
                      }}
                    >
                      {profile.phone_verified ? "✓ VERIFIED" : "UNVERIFIED"}
                    </span>
                  ) : null}
                </span>
                <input
                  style={P.setInputMono}
                  value={current.phone}
                  inputMode="tel"
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+254…"
                />
              </label>
              <label style={P.setField}>
                <span style={P.setFieldLabel}>Email</span>
                {isCompany ? (
                  <input
                    style={P.setInput}
                    type="email"
                    value={current.company_email}
                    onChange={(e) => set("company_email", e.target.value)}
                  />
                ) : (
                  <input style={{ ...P.setInput, background: "#F8F9FB" }} value={profile.email} readOnly />
                )}
              </label>
            </div>
            {!isCompany && (
              <div style={{ padding: "0 18px 18px", ...O.helper }}>
                That&rsquo;s your sign-in email. Changing it is a separate step — contact CRAL.
              </div>
            )}
            {profile.phone && !profile.phone_verified && !dirty && (
              <div style={{ padding: "0 18px 18px" }}>
                <PhoneVerify phone={profile.phone} />
              </div>
            )}
          </div>
        </div>

        <div style={P.setBodySide}>
          <div style={P.setCard}>
            <div style={P.setCardHead}>
              <div style={P.setCardTitle}>Business documents</div>
              <div style={P.setCardSub}>
                Checked once for the account, separate from each vehicle&rsquo;s papers.
              </div>
            </div>
            {profile.documents.map((d) => {
              const s = DOC_STATE[d.review_state];
              return (
                <div key={d.kind} style={P.setListRow}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={P.setListName}>{d.label}</div>
                    <div style={P.setListMeta}>
                      {d.uploaded_at
                        ? `uploaded ${new Date(d.uploaded_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}`
                        : "not on file"}
                    </div>
                  </div>
                  <span style={{ ...P.setSessionTag, color: s.fg }}>{s.label}</span>
                  {d.document_id && <ViewDocButton documentId={d.document_id} />}
                </div>
              );
            })}
            <div style={P.setCardFoot}>
              A reviewer checks new uploads within two working days. To replace one of these, use the
              document drawer on a vehicle, or contact CRAL.
              {isCompany
                ? " Certificate of incorporation and CR12 aren't managed here yet."
                : ""}
            </div>
          </div>
        </div>
      </div>

      {dirty && <SaveBar onSave={onSave} onDiscard={() => setDraft(null)} saving={save.isPending} />}
    </>
  );
}

function ViewDocButton({ documentId }: { documentId: string }): JSX.Element {
  const [busy, setBusy] = useState(false);
  async function open(): Promise<void> {
    setBusy(true);
    try {
      const blob = await apiBlob(`/merchant/onboarding/documents/${documentId}`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" style={P.setSmallBtn} onClick={() => void open()} disabled={busy}>
      {busy ? "Opening…" : "View"}
    </button>
  );
}

function PhoneVerify({ phone }: { phone: string }): JSX.Element {
  const qc = useQueryClient();
  const flash = useToast();
  const [step, setStep] = useState<"idle" | "code">("idle");
  const [code, setCode] = useState("");
  const [masked, setMasked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await startPhoneVerification(phone);
      setMasked(res.masked_destination);
      setStep("code");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Couldn't text a code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await confirmPhoneVerification(code.trim());
      await qc.invalidateQueries({ queryKey: ["merchant-profile"] });
      flash("Phone number verified.", "#0B8A5B");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "That code isn't right.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...P.setInlineNote, display: "grid", gap: 10, maxWidth: 400 }}>
      {step === "idle" ? (
        <>
          <span>Your payout number isn&rsquo;t verified. Payouts need a verified number.</span>
          <button type="button" style={P.setSignBtn} onClick={() => void send()} disabled={busy}>
            {busy ? "Texting…" : "Send a code"}
          </button>
        </>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <FormField label={`6-digit code texted to ${masked}`}>
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="123456"
            />
          </FormField>
          <PrimaryButton onClick={() => void confirm()} disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Verify"}
          </PrimaryButton>
        </div>
      )}
      {error && <div style={O.fieldError}>{error}</div>}
    </div>
  );
}

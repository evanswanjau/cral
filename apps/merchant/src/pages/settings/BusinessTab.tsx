import { useMemo, useState, type ReactNode } from "react";
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
 * Settings → Business (companies) / "My profile" (individuals). The fields
 * mirror onboarding's "Your details" step one-for-one - nothing new is
 * asked for after onboarding (owner's call, 2026-09-03).
 *
 * Deliberate omissions vs "Cruz Merchant Settings.dc.html", all confirmed:
 *  - No "County" select. `merchants.county` was dropped on 2026-08-31.
 *  - No "Trading name" / standalone "Yard or office address" - onboarding
 *    doesn't collect them. (The `trading_name` column exists but is not
 *    surfaced here.)
 *  - No WhatsApp toggle.
 *  - "Business documents" is a read-only view of the account-level owner
 *    docs; certificate-of-incorporation / CR12 upload is deferred.
 */

type Draft = {
  first_name: string;
  middle_name: string;
  surname: string;
  national_id: string;
  kra_pin: string;
  phone: string;
  company_name: string;
  company_cert_no: string;
  company_kra: string;
  company_email: string;
  company_address: string;
};

// The account entity type is fixed at onboarding - changing it means new
// documents and a re-review, so it's a support path, not a settings field
// (same reasoning as the read-only sign-in email).
const FIELDS: Array<keyof Draft> = [
  "first_name",
  "middle_name",
  "surname",
  "national_id",
  "kra_pin",
  "phone",
  "company_name",
  "company_cert_no",
  "company_kra",
  "company_email",
  "company_address",
];

function toDraft(p: MerchantProfile): Draft {
  return {
    first_name: p.first_name ?? "",
    middle_name: p.middle_name ?? "",
    surname: p.surname ?? "",
    national_id: p.national_id ?? "",
    kra_pin: p.kra_pin ?? "",
    phone: p.phone ?? "",
    company_name: p.company_name ?? "",
    company_cert_no: p.company_cert_no ?? "",
    company_kra: p.company_kra ?? "",
    company_email: p.company_email ?? "",
    company_address: p.company_address ?? "",
  };
}

function diffPatch(base: Draft, draft: Draft): MerchantProfilePatch {
  const patch: MerchantProfilePatch = {};
  FIELDS.forEach((k) => {
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

  const isCompany = profile.owner_type === "company";
  const patch = diffPatch(base, current);
  const dirty = Object.keys(patch).length > 0;
  const set = (k: keyof Draft, v: string) => setDraft({ ...(draft ?? base), [k]: v } as Draft);

  async function onSave(): Promise<void> {
    try {
      await save.mutateAsync(patch);
      setDraft(null);
      toast("Details saved.", "#0B8A5B");
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "Couldn't save that. Try again.", "#D81E32");
    }
  }

  return (
    <>
      <div style={P.setBodyWrap}>
        <div style={P.setBodyMain}>
          {isCompany && (
            <div style={P.setCard}>
              <div style={P.setCardHead}>
                <div style={P.setCardTitle}>Company details</div>
                <div style={P.setCardSub}>As registered with the Registrar of Companies.</div>
              </div>
              <div style={P.setFieldGrid}>
                <Field label="Company name">
                  <input style={P.setInput} value={current.company_name} onChange={(e) => set("company_name", e.target.value)} />
                </Field>
                <Field label="Certificate of incorporation">
                  <input style={P.setInputMono} value={current.company_cert_no} onChange={(e) => set("company_cert_no", e.target.value)} placeholder="CPR/2020/123456" />
                </Field>
                <Field label="Company KRA PIN">
                  <input style={P.setInputMono} value={current.company_kra} onChange={(e) => set("company_kra", e.target.value.toUpperCase())} placeholder="P051234567X" />
                </Field>
                <Field label="Company email">
                  <input style={P.setInput} type="email" value={current.company_email} onChange={(e) => set("company_email", e.target.value)} />
                </Field>
                <Field label="Company physical location">
                  <input style={P.setInput} value={current.company_address} onChange={(e) => set("company_address", e.target.value)} placeholder="Enterprise Road, Industrial Area, Nairobi" />
                </Field>
              </div>
            </div>
          )}

          <div style={P.setCard}>
            <div style={P.setCardHead}>
              <div style={P.setCardTitle}>{isCompany ? "Contact person" : "Owner details"}</div>
              <div style={P.setCardSub}>
                {isCompany
                  ? "The person we deal with - their own ID and PIN."
                  : "Exactly as written on your National ID."}
              </div>
            </div>
            <div style={P.setFieldGrid}>
              <Field label="First name">
                <input style={P.setInput} value={current.first_name} onChange={(e) => set("first_name", e.target.value)} />
              </Field>
              <Field label="Middle name">
                <input style={P.setInput} value={current.middle_name} onChange={(e) => set("middle_name", e.target.value)} placeholder="Only if it appears on the ID" />
              </Field>
              <Field label="Surname">
                <input style={P.setInput} value={current.surname} onChange={(e) => set("surname", e.target.value)} />
              </Field>
              <Field label="National ID number">
                <input style={P.setInputMono} value={current.national_id} inputMode="numeric" onChange={(e) => set("national_id", e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="KRA PIN">
                <input style={P.setInputMono} value={current.kra_pin} onChange={(e) => set("kra_pin", e.target.value.toUpperCase())} placeholder="A012345678Z" />
              </Field>
              <Field label="Email">
                <input style={{ ...P.setInput, background: "#F8F9FB" }} value={profile.email} readOnly aria-label="Account email" />
              </Field>
            </div>
            {!isCompany && (
              <div style={{ padding: "0 18px 18px", ...O.helper }}>
                Receipts and payout statements go to this address.
              </div>
            )}
          </div>

          <div style={P.setCard}>
            <div style={P.setCardHead}>
              <div style={P.setCardTitle}>How CRAL reaches you</div>
              <div style={P.setCardSub}>
                Booking alerts and reviewer notes go here. Hirers never see it.
              </div>
            </div>
            <div style={P.setFieldGrid}>
              <label style={P.setField}>
                <span style={P.setFieldLabelRow}>
                  Phone number
                  {profile.phone ? (
                    <span
                      style={{ ...P.setChip, ...(profile.phone_verified ? P.setChipOk : P.setChipWarn) }}
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
            </div>
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
              <div style={P.setCardTitle}>{isCompany ? "Business documents" : "Your documents"}</div>
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
              {isCompany ? " Certificate of incorporation and CR12 aren't managed here yet." : ""}
            </div>
          </div>
        </div>
      </div>

      {dirty && <SaveBar onSave={onSave} onDiscard={() => setDraft(null)} saving={save.isPending} />}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label style={P.setField}>
      <span style={P.setFieldLabel}>{label}</span>
      {children}
    </label>
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

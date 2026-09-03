import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
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
  useRequestProfileChange,
  useUpdateProfile,
  useUploadAccountDocument,
  useWithdrawProfileChangeRequest,
  type AccountDocKind,
  type MerchantProfile,
  type MerchantProfilePatch,
  type ProfileDocument,
} from "../../lib/settings-api.js";

/**
 * Settings → Business (companies) / "My profile" (individuals). The fields
 * mirror onboarding's "Your details" step one-for-one.
 *
 * **Locked after submission.** Once onboarding is submitted these fields
 * are a fraud surface (they must match the logbooks), so they go
 * read-only. "Request a change" captures the edit as a
 * `profile_change_requests` row; an admin approves it and the account goes
 * back to review (owner's call, 2026-09-04). No admin portal yet - see
 * `apps/api/src/scripts/review-profile-change.ts`.
 *
 * Documents: personal docs (owner ID, KRA) always shown; for a company a
 * "Business documents | My documents" switch also surfaces the cert of
 * incorporation and CR12. Upload goes through the onboarding documents
 * endpoint (authenticated, works post-onboarding).
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

const FIELD_LABEL: Record<keyof Draft, string> = {
  first_name: "First name",
  middle_name: "Middle name",
  surname: "Surname",
  national_id: "National ID number",
  kra_pin: "KRA PIN",
  phone: "Phone number",
  company_name: "Company name",
  company_cert_no: "Certificate of incorporation",
  company_kra: "Company KRA PIN",
  company_email: "Company email",
  company_address: "Company physical location",
};

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
  const directSave = useUpdateProfile();
  const requestChange = useRequestProfileChange();
  const withdraw = useWithdrawProfileChangeRequest();

  const base = useMemo(() => (profile ? toDraft(profile) : null), [profile]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const current = draft ?? base;

  if (isLoading || !profile || !base || !current) {
    return <div style={{ ...P.card, padding: 20 }}>Loading…</div>;
  }

  const isCompany = profile.owner_type === "company";
  const locked = profile.profile_locked;
  const pending = profile.pending_change;
  // Fields are editable when the profile isn't locked, or when it is and
  // the merchant has pressed "Request a change".
  const canEdit = !locked || editing;

  const patch = diffPatch(base, current);
  const dirty = Object.keys(patch).length > 0;
  const set = (k: keyof Draft, v: string) => setDraft({ ...(draft ?? base), [k]: v } as Draft);

  function stopEditing(): void {
    setDraft(null);
    setEditing(false);
  }

  async function onSave(): Promise<void> {
    try {
      if (locked) {
        await requestChange.mutateAsync(patch);
        toast("Change submitted for review.", "#0B8A5B");
      } else {
        await directSave.mutateAsync(patch);
        toast("Details saved.", "#0B8A5B");
      }
      stopEditing();
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "Couldn't do that. Try again.", "#D81E32");
    }
  }

  async function onWithdraw(): Promise<void> {
    try {
      await withdraw.mutateAsync();
      toast("Change withdrawn.", "#8C97A8");
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "Couldn't withdraw it.", "#D81E32");
    }
  }

  const inputStyle = (mono?: boolean) => ({
    ...(mono ? P.setInputMono : P.setInput),
    ...(canEdit ? {} : { background: "#F8F9FB", color: "#5A6373" }),
  });

  return (
    <>
      {pending && (
        <div style={{ ...P.banner, background: "#FFF3DB", borderColor: "#F5D9A3", marginBottom: 16 }}>
          <span style={{ ...P.bannerDot, background: "#C77400" }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ ...P.bannerTitle, color: "#8A5200" }}>A change is waiting for review</div>
            <div style={{ ...P.bannerBody, color: "#8A5200" }}>
              {Object.keys(pending.changes)
                .map((k) => FIELD_LABEL[k as keyof Draft] ?? k)
                .join(", ")}
              . A reviewer checks profile changes within two working days.
            </div>
          </div>
          <button
            type="button"
            style={P.setDangerBtnSmall}
            onClick={() => void onWithdraw()}
            disabled={withdraw.isPending}
          >
            Withdraw
          </button>
        </div>
      )}

      {locked && !pending && !editing && (
        <div style={{ ...P.setInlineNote, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <span style={{ flex: 1, minWidth: 200 }}>
            These details are locked after submission. A change needs a reviewer&rsquo;s approval and
            re-check.
          </span>
          <button type="button" style={P.setSignBtn} onClick={() => setEditing(true)}>
            Request a change
          </button>
        </div>
      )}

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
                  <input style={inputStyle()} value={current.company_name} readOnly={!canEdit} onChange={(e) => set("company_name", e.target.value)} />
                </Field>
                <Field label="Certificate of incorporation">
                  <input style={inputStyle(true)} value={current.company_cert_no} readOnly={!canEdit} onChange={(e) => set("company_cert_no", e.target.value)} placeholder="CPR/2020/123456" />
                </Field>
                <Field label="Company KRA PIN">
                  <input style={inputStyle(true)} value={current.company_kra} readOnly={!canEdit} onChange={(e) => set("company_kra", e.target.value.toUpperCase())} placeholder="P051234567X" />
                </Field>
                <Field label="Company email">
                  <input style={inputStyle()} type="email" value={current.company_email} readOnly={!canEdit} onChange={(e) => set("company_email", e.target.value)} />
                </Field>
                <Field label="Company physical location">
                  <input style={inputStyle()} value={current.company_address} readOnly={!canEdit} onChange={(e) => set("company_address", e.target.value)} placeholder="Enterprise Road, Industrial Area, Nairobi" />
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
                <input style={inputStyle()} value={current.first_name} readOnly={!canEdit} onChange={(e) => set("first_name", e.target.value)} />
              </Field>
              <Field label="Middle name">
                <input style={inputStyle()} value={current.middle_name} readOnly={!canEdit} onChange={(e) => set("middle_name", e.target.value)} placeholder="Only if it appears on the ID" />
              </Field>
              <Field label="Surname">
                <input style={inputStyle()} value={current.surname} readOnly={!canEdit} onChange={(e) => set("surname", e.target.value)} />
              </Field>
              <Field label="National ID number">
                <input style={inputStyle(true)} value={current.national_id} readOnly={!canEdit} inputMode="numeric" onChange={(e) => set("national_id", e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="KRA PIN">
                <input style={inputStyle(true)} value={current.kra_pin} readOnly={!canEdit} onChange={(e) => set("kra_pin", e.target.value.toUpperCase())} placeholder="A012345678Z" />
              </Field>
              <Field label="Email">
                <input style={{ ...P.setInput, background: "#F8F9FB", color: "#5A6373" }} value={profile.email} readOnly aria-label="Account email" />
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
              <div style={P.setCardSub}>Booking alerts and reviewer notes go here. Hirers never see it.</div>
            </div>
            <div style={P.setFieldGrid}>
              <label style={P.setField}>
                <span style={P.setFieldLabelRow}>
                  Phone number
                  {profile.phone ? (
                    <span style={{ ...P.setChip, ...(profile.phone_verified ? P.setChipOk : P.setChipWarn) }}>
                      {profile.phone_verified ? "✓ VERIFIED" : "UNVERIFIED"}
                    </span>
                  ) : null}
                </span>
                <input
                  style={inputStyle(true)}
                  value={current.phone}
                  readOnly={!canEdit}
                  inputMode="tel"
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+254…"
                />
              </label>
            </div>
            {profile.phone && !profile.phone_verified && !dirty && !locked && (
              <div style={{ padding: "0 18px 18px" }}>
                <PhoneVerify phone={profile.phone} />
              </div>
            )}
          </div>
        </div>

        <div style={P.setBodySide}>
          <DocumentsCard documents={profile.documents} isCompany={isCompany} />
        </div>
      </div>

      {dirty && (
        <SaveBar
          onSave={onSave}
          onDiscard={stopEditing}
          saving={directSave.isPending || requestChange.isPending}
          label={locked ? "Submit for review" : "Save changes"}
          message={locked ? "This change needs a reviewer's approval" : "Unsaved changes on this page"}
        />
      )}
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

// --- documents ---------------------------------------------------

function DocumentsCard({
  documents,
  isCompany,
}: {
  documents: ProfileDocument[];
  isCompany: boolean;
}): JSX.Element {
  const [group, setGroup] = useState<"business" | "personal">(isCompany ? "business" : "personal");
  const shown = documents.filter((d) => (isCompany ? d.group === group : true));

  return (
    <div style={P.setCard}>
      <div style={P.setCardHead}>
        <div style={P.setCardTitle}>Account documents</div>
        <div style={P.setCardSub}>
          Checked once for the account, separate from each vehicle&rsquo;s papers.
        </div>
      </div>
      {isCompany && (
        <div style={{ display: "flex", gap: 6, padding: "12px 18px 0" }}>
          {(
            [
              ["business", "Business documents"],
              ["personal", "My documents"],
            ] as const
          ).map(([key, label]) => {
            const on = group === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setGroup(key)}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 999,
                  border: `1px solid ${on ? "#0B0F1A" : "#CDD2DA"}`,
                  background: on ? "#0B0F1A" : "#FFFFFF",
                  color: on ? "#FFFFFF" : "#333B4A",
                  font: "600 12px/1 'Instrument Sans',sans-serif",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      {shown.map((d) => (
        <DocRow key={d.kind} doc={d} />
      ))}
      <div style={P.setCardFoot}>A reviewer checks new uploads within two working days.</div>
    </div>
  );
}

function DocRow({ doc }: { doc: ProfileDocument }): JSX.Element {
  const s = DOC_STATE[doc.review_state];
  const upload = useUploadAccountDocument();
  const fileRef = useRef<HTMLInputElement>(null);
  const flash = useToast();

  async function onFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await upload.mutateAsync({ kind: doc.kind as AccountDocKind, file });
      flash("Uploaded. A reviewer will check it.", "#0B8A5B");
    } catch (err) {
      flash(err instanceof ApiClientError ? err.message : "Couldn't upload that.", "#D81E32");
    }
  }

  return (
    <div style={P.setListRow}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={P.setListName}>{doc.label}</div>
        <div style={P.setListMeta}>
          {doc.uploaded_at
            ? `uploaded ${new Date(doc.uploaded_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
            : "not on file"}
        </div>
      </div>
      <span style={{ ...P.setSessionTag, color: s.fg }}>{s.label}</span>
      {doc.document_id && <ViewDocButton documentId={doc.document_id} />}
      <button
        type="button"
        style={P.setSmallBtn}
        onClick={() => fileRef.current?.click()}
        disabled={upload.isPending}
      >
        {upload.isPending ? "…" : doc.document_id ? "Replace" : "Upload"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => void onFile(e)}
      />
    </div>
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

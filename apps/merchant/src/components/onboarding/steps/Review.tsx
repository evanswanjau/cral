import { useState } from "react";
import { O } from "../styles.js";
import { ImageSquare } from "@phosphor-icons/react/dist/ssr/ImageSquare";
import { BackButton, Kes, PlateBadge, PrimaryButton } from "../primitives.js";
import { usePhotoPreview } from "../../../lib/use-photo-preview.js";
import { vehicleTypeLabel } from "../../../lib/vehicle-categories.js";
import type { DraftPhoto, OnboardingDraft } from "../../../lib/onboarding-draft.js";

export function Review({
  draft,
  onChange,
  onEditStep,
  onBack,
  onSubmit,
  submitting,
}: {
  draft: OnboardingDraft;
  onChange: (patch: Partial<OnboardingDraft>) => void;
  onEditStep: (step: number) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting?: boolean;
}): JSX.Element {
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const fullName = [draft.firstName, draft.middleName, draft.surname].filter(Boolean).join(" ");

  const blockedReason = !draft.phoneVerified
    ? "Verify your phone number on the Your details step first."
    : !draft.termsAccepted
      ? "Accept the merchant terms and conditions first."
      : null;

  function handleSubmit() {
    if (blockedReason) {
      setAttemptedSubmit(true);
      return;
    }
    onSubmit();
  }

  return (
    <div style={O.wReview}>
      <div style={O.stepEyebrow}>STEP 5 OF 5</div>
      <h1 style={O.h1Step}>Review and submit</h1>
      <p style={{ ...O.stepLede, marginBottom: 20 }}>One last look before you send it to us. You can still change anything.</p>

      <div style={{ ...O.darkCard, marginBottom: 20 }}>
        <div style={O.darkEyebrow}>
          <span style={O.skewRule} />
          <span style={O.darkEyebrowText}>AFTER YOU SUBMIT</span>
        </div>
        <div style={{ font: "700 20px/1.3 Archivo,sans-serif", color: "#fff", marginBottom: 10 }}>
          We check everything before your listing goes live.
        </div>
        <p style={{ ...O.darkBody, marginBottom: 0 }}>
          Usually within two working days. We&rsquo;ll let you know as soon as it&rsquo;s approved and
          live. Nothing to pay to list - our fee applies only to completed bookings and is set out in
          the merchant terms below.
        </p>
      </div>

      <div style={O.reviewGrid}>
        <div style={O.reviewCard}>
          <div style={O.reviewCardHead}>
            <div style={O.cardTitle}>Your details</div>
            <EditButton onClick={() => onEditStep(2)} />
          </div>
          <div style={O.reviewCardBody}>
            {draft.ownerType === "company" && (
              <>
                <ReviewRow label="Company" value={draft.companyName || "-"} />
                <ReviewRow label="Company email" value={draft.companyEmail || "-"} />
                <ReviewRow label="Company location" value={draft.companyAddress || "-"} />
              </>
            )}
            <ReviewRow label={draft.ownerType === "company" ? "Contact person" : "Name"} value={fullName || "-"} />
            <ReviewRow label="National ID" value={draft.nationalId || "-"} />
            <ReviewRow label="KRA PIN" value={draft.kraPin || "-"} />
            <ReviewRow
              label="Phone"
              value={
                draft.phone
                  ? `+254 ${draft.phone}${draft.phoneVerified ? " · verified" : " · not verified"}`
                  : "-"
              }
            />
            <ReviewRow label="Email" value={draft.email || "-"} />
            {draft.ownerType === "company" || draft.payoutMethod === "bank" ? (
              <ReviewRow
                payout
                label="Bank payout"
                value={
                  draft.bankName && draft.bankAccountNumber
                    ? `${draft.bankName} · ${draft.bankAccountNumber}`
                    : "-"
                }
              />
            ) : (
              <ReviewRow
                payout
                label="M-Pesa payout"
                value={(() => {
                  const num = draft.payoutSame ? draft.phone : draft.payoutDetail;
                  return num ? `+254 ${num}` : "-";
                })()}
              />
            )}
          </div>
        </div>

        <div style={O.reviewCard}>
          <div style={O.reviewCardHead}>
            <div style={O.cardTitle}>Documents</div>
            <EditButton onClick={() => onEditStep(4)} />
          </div>
          <div style={O.reviewCardBody}>
            <ReviewComplete
              label="Your documents"
              complete={
                Boolean(draft.ownerDocs.nationalId) &&
                Boolean(draft.ownerDocs.kraPin) &&
                (draft.ownerType !== "company" ||
                  (Boolean(draft.ownerDocs.certificateOfIncorporation) && Boolean(draft.ownerDocs.cr12)))
              }
            />
            {draft.vehicles.map((v) => (
              <ReviewComplete
                key={v.id}
                label={`${v.registration || "Vehicle"} · vehicle papers`}
                complete={Boolean(v.docs.logbook) && Boolean(v.docs.comprehensiveInsurance) && Boolean(v.docs.trackerCertificate)}
              />
            ))}
            <p style={{ ...O.helper, marginTop: 4, marginBottom: 0 }}>Everything we need is attached.</p>
          </div>
        </div>
      </div>

      <div style={O.reviewCard}>
        <div style={O.reviewCardHead}>
          <div style={O.cardTitle}>Vehicles · {draft.vehicles.length}</div>
          <EditButton onClick={() => onEditStep(3)} />
        </div>
        <div style={{ padding: "0 18px" }}>
          {draft.vehicles.map((v) => (
            <div
              key={v.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "13px 0",
                borderBottom: "1px solid #F1F3F6",
                flexWrap: "wrap",
              }}
            >
              <PlateBadge>{v.registration || "-"}</PlateBadge>
              <div style={{ flex: 1 }}>
                <div style={O.fleetName}>{v.make} {v.model}</div>
                <div style={O.fleetSub}>{vehicleTypeLabel(v.type)} · {v.year} · {v.photos.length} photos · {v.county || "-"} · {v.chauffeured ? "With driver" : "Self-drive"}</div>
                {v.photos.length > 0 && (
                  <div style={O.reviewPhotoRow}>
                    {v.photos.map((photo) => (
                      <ReviewPhotoThumb key={photo.id} photo={photo} />
                    ))}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <Kes amount={Number(v.dailyRate) || 0} size={15} />
                <span style={O.fleetRateSuffix}>/day</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          ...O.reviewCard,
          ...(draft.termsAccepted ? { borderColor: "#A8DEC7" } : {}),
          ...(attemptedSubmit && !draft.termsAccepted ? { border: "1px solid #D81E32" } : {}),
        }}
      >
        <div style={O.reviewCardHead}>
          <div style={O.cardTitle}>Merchant terms and conditions</div>
          <span style={O.reviewRequiredPill}>REQUIRED</span>
        </div>
        <div style={O.reviewCardBody}>
          <p
            style={{
              margin: "0 0 4px",
              font: "400 13px/1.55 'Instrument Sans',sans-serif",
              color: "#5A6373",
              textWrap: "pretty",
            }}
          >
            The merchant terms are the agreement between you and CRAL. Please read them in full
            before you submit. They apply to every vehicle on this account, and to every booking,
            for as long as you list with us.
          </p>
          <button
            type="button"
            onClick={() => onChange({ termsAccepted: !draft.termsAccepted })}
            style={{
              ...O.termsBox,
              ...(draft.termsAccepted ? O.termsBoxActive : {}),
              ...(attemptedSubmit && !draft.termsAccepted ? O.termsBoxError : {}),
              width: "100%",
              cursor: "pointer",
            }}
          >
            <span style={{ ...O.termsCheck, ...(draft.termsAccepted ? O.termsCheckActive : {}) }}>
              {draft.termsAccepted ? "✓" : ""}
            </span>
            <span style={O.termsText}>
              I have read and accept the CRAL merchant terms and conditions, and I confirm the
              details on this page are true.
            </span>
          </button>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
            {attemptedSubmit && !draft.termsAccepted ? (
              <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: "#D81E32" }}>Accept the terms to submit.</span>
            ) : (
              <span />
            )}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <a href="#" style={O.ghostLinkBtn}>Read the merchant terms</a>
              <a href="#" style={O.ghostLinkBtn}>Privacy notice</a>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <BackButton onClick={onBack}>← Back to documents</BackButton>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {attemptedSubmit && blockedReason && (
            <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: "#D81E32" }}>{blockedReason}</span>
          )}
          <PrimaryButton onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit for review"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/** A photo thumbnail that re-fetches its bytes if the page was reloaded. */
function ReviewPhotoThumb({ photo }: { photo: DraftPhoto }): JSX.Element {
  const preview = usePhotoPreview(photo.documentId);
  return preview ? (
    <img src={preview} alt={photo.name} style={O.reviewPhotoThumb} />
  ) : (
    <span style={O.reviewPhotoFallback} title={photo.name}>
      <ImageSquare size={16} weight="fill" color="#CDD2DA" />
    </span>
  );
}

function EditButton({ onClick }: { onClick: () => void }): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...O.reviewEditBtn, ...(hover ? O.reviewEditBtnHover : {}) }}
    >
      Edit
    </button>
  );
}

function ReviewRow({ label, value, payout }: { label: string; value: string; payout?: boolean }): JSX.Element {
  return (
    <div style={{ ...O.reviewRow, ...(payout ? O.reviewRowPayout : {}) }}>
      <span style={payout ? O.reviewLabelPayout : O.reviewLabel}>{label}</span>
      <span style={payout ? O.reviewValuePayout : O.reviewValue}>{value}</span>
    </div>
  );
}

function ReviewComplete({ label, complete }: { label: string; complete: boolean }): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 0", borderBottom: "1px solid #F1F3F6", flexWrap: "wrap" }}>
      <span style={{ font: "600 13px/1.4 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{label}</span>
      <span
        style={{
          ...O.statusPillBase,
          background: complete ? "#DDF3E9" : "#FFF3DB",
          border: `1px solid ${complete ? "#A8DEC7" : "#F5D9A3"}`,
          color: complete ? "#076945" : "#8A5200",
        }}
      >
        <span style={{ ...O.statusDot, background: complete ? "#0B8A5B" : "#C77400" }} />
        {complete ? "Complete" : "Incomplete"}
      </span>
    </div>
  );
}

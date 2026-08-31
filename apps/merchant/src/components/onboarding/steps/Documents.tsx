import { useRef, useState } from "react";
import { User } from "@phosphor-icons/react/dist/ssr/User";
import { O } from "../styles.js";
import { BackButton, PlateBadge, PrimaryButton, TextInput } from "../primitives.js";
import { formatFileSize } from "../../../lib/format.js";
import { vehicleTypeLabel } from "../../../lib/vehicle-categories.js";
import {
  deleteDocument,
  updateVehicleOnServer,
  uploadOwnerDocument,
  uploadVehicleDocument,
  type DraftDocument,
  type OnboardingDraft,
} from "../../../lib/onboarding-draft.js";

type OwnerDocKind = "national_id" | "kra_pin";
type VehicleDocKind = "logbook" | "comprehensive_insurance" | "tracker_certificate";

export const MAX_DOC_BYTES = 10 * 1024 * 1024;
const ACCEPTED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPTED_DOC_LABEL = "PDF, JPG or PNG";

/** Today, local time, as the date input's `min` needs it (YYYY-MM-DD). */
function todayIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
}

function DocRow({
  title,
  body,
  doc,
  onChange,
  kind,
  vehicleId,
  expiry,
  onExpiryChange,
  expiryError,
}: {
  title: string;
  body: string;
  doc: DraftDocument | null;
  onChange: (doc: DraftDocument | null) => void;
  kind: OwnerDocKind | VehicleDocKind;
  /** Present for vehicle-scoped kinds, absent for owner kinds. */
  vehicleId?: string;
  expiry?: string;
  onExpiryChange?: (v: string) => void;
  expiryError?: boolean;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!ACCEPTED_DOC_TYPES.includes(file.type)) {
      setError(`${file.name} isn't a supported file type. Use ${ACCEPTED_DOC_LABEL}.`);
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      setError(`${file.name} is ${formatFileSize(file.size)} - the limit is 10MB.`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploaded = vehicleId
        ? await uploadVehicleDocument(vehicleId, kind as VehicleDocKind, file)
        : await uploadOwnerDocument(kind as OwnerDocKind, file);
      onChange(uploaded);
    } catch {
      setError("Couldn't upload that file. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    const removed = doc;
    onChange(null);
    if (removed) {
      try {
        await deleteDocument(removed.documentId);
      } catch {
        // Already cleared locally; a failed server delete just leaves an orphaned row.
      }
    }
  }

  return (
    <div
      style={{ ...O.docRow, ...(dragOver ? O.docRowDrag : {}) }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_DOC_TYPES.join(",")}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <span style={doc ? O.docIconDone : O.docIconEmpty}>{doc ? "✓" : "+"}</span>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={O.docTitle}>{title}</div>
        {doc ? (
          <div style={O.docFileRow}>
            <span style={O.docFile} title={doc.name}>
              {doc.name} · {formatFileSize(doc.size)}
            </span>
            <button
              type="button"
              style={O.docRemoveSmall}
              onClick={() => void handleRemove()}
              aria-label={`Remove ${title}`}
            >
              ✕
            </button>
          </div>
        ) : (
          <div style={O.docBody}>{body}</div>
        )}
        {error && <div style={O.fieldError}>{error}</div>}
        {onExpiryChange && (
          <div style={O.expiryRow}>
            <div>
              <label style={O.expiryLabel}>
                Expiry date<span style={O.required}> *</span>
              </label>
              <TextInput
                type="date"
                value={expiry}
                // A document can't expire in the past - today is the floor,
                // not just a validation message after the fact.
                min={todayIso()}
                onChange={(e) => onExpiryChange(e.target.value)}
                error={expiryError}
                style={O.expiryInput}
              />
            </div>
            <div style={O.expiryHelper}>We flag the listing before it runs out.</div>
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={uploading}
        style={doc ? O.secondaryBtnSmall : O.primaryBtnSmall}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Uploading…" : doc ? "Replace" : "Attach"}
      </button>
    </div>
  );
}

export function Documents({
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

  const ownerCount = Number(Boolean(draft.ownerDocs.nationalId)) + Number(Boolean(draft.ownerDocs.kraPin));
  const ownerComplete = ownerCount === 2;

  function vehicleComplete(vId: string): boolean {
    const v = draft.vehicles.find((x) => x.id === vId);
    if (!v) return false;
    const count =
      Number(Boolean(v.docs.logbook)) +
      Number(Boolean(v.docs.comprehensiveInsurance)) +
      Number(Boolean(v.docs.trackerCertificate));
    return count === 3 && (!v.docs.comprehensiveInsurance || Boolean(v.insuranceExpiry));
  }

  const allComplete = ownerComplete && draft.vehicles.every((v) => vehicleComplete(v.id));

  function handleContinue() {
    if (!allComplete) {
      setShowErrors(true);
      return;
    }
    onContinue();
  }

  return (
    <div style={O.wDocuments}>
      <div style={O.stepEyebrow}>STEP 4 OF 5</div>
      <h1 style={O.h1Step}>Documents</h1>
      <p style={{ ...O.stepLede, marginBottom: 20 }}>
        Your own papers first, then the papers for each vehicle. Photos are fine - every corner
        readable, including expiry dates. {ACCEPTED_DOC_LABEL} up to 10MB.
      </p>

      <div style={O.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={O.sectionBadge}><User size={20} weight="fill" color="#FFFFFF" /></span>
            <div>
              <div style={O.cardTitle}>Your documents</div>
              <div style={O.optionBody}>Uploaded once - they cover every vehicle you list</div>
            </div>
          </div>
          <span
            style={{
              ...O.statusPillBase,
              background: ownerComplete ? "#DDF3E9" : "#FFF3DB",
              border: `1px solid ${ownerComplete ? "#A8DEC7" : "#F5D9A3"}`,
              color: ownerComplete ? "#076945" : "#8A5200",
            }}
          >
            {ownerCount}/2
          </span>
        </div>

        <DocRow
          title="National ID · both sides"
          body="Front and back, one file or two photos"
          doc={draft.ownerDocs.nationalId}
          onChange={(doc) => onChange({ ownerDocs: { ...draft.ownerDocs, nationalId: doc } })}
          kind="national_id"
        />
        <DocRow
          title="KRA PIN certificate"
          body="Matching the PIN you entered"
          doc={draft.ownerDocs.kraPin}
          onChange={(doc) => onChange({ ownerDocs: { ...draft.ownerDocs, kraPin: doc } })}
          kind="kra_pin"
        />
      </div>

      {draft.vehicles.map((v) => {
        const count =
          Number(Boolean(v.docs.logbook)) +
          Number(Boolean(v.docs.comprehensiveInsurance)) +
          Number(Boolean(v.docs.trackerCertificate));
        const complete = vehicleComplete(v.id);
        const setDocs = (patch: Partial<typeof v.docs>) =>
          onChange({ vehicles: draft.vehicles.map((x) => (x.id === v.id ? { ...x, docs: { ...x.docs, ...patch } } : x)) });
        const setExpiry = (val: string) => {
          onChange({ vehicles: draft.vehicles.map((x) => (x.id === v.id ? { ...x, insuranceExpiry: val } : x)) });
          void updateVehicleOnServer(v.id, { insuranceExpiry: val });
        };

        return (
          <div key={v.id} style={O.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <PlateBadge>{v.registration || "-"}</PlateBadge>
                <div>
                  <div style={O.cardTitle}>{v.make} {v.model}</div>
                  <div style={O.optionBody}>{vehicleTypeLabel(v.type)} · {v.year} · {v.colour || "-"} · {v.county || "-"} · {v.pickupAddress || "-"}</div>
                </div>
              </div>
              <span
                style={{
                  ...O.statusPillBase,
                  background: complete ? "#DDF3E9" : "#FFF3DB",
                  border: `1px solid ${complete ? "#A8DEC7" : "#F5D9A3"}`,
                  color: complete ? "#076945" : "#8A5200",
                }}
              >
                {count}/3
              </span>
            </div>

            <DocRow
              title="Logbook"
              body="All pages showing owner and chassis number"
              doc={v.docs.logbook}
              onChange={(doc) => setDocs({ logbook: doc })}
              kind="logbook"
              vehicleId={v.id}
            />
            <DocRow
              title="Comprehensive insurance"
              body="Cover note or certificate - not third-party"
              doc={v.docs.comprehensiveInsurance}
              onChange={(doc) => setDocs({ comprehensiveInsurance: doc })}
              kind="comprehensive_insurance"
              vehicleId={v.id}
              expiry={v.insuranceExpiry}
              onExpiryChange={setExpiry}
              expiryError={Boolean(v.docs.comprehensiveInsurance) && !v.insuranceExpiry}
            />
            <DocRow
              title="Car tracker certificate"
              body="From your tracking provider"
              doc={v.docs.trackerCertificate}
              onChange={(doc) => setDocs({ trackerCertificate: doc })}
              kind="tracker_certificate"
              vehicleId={v.id}
            />
          </div>
        );
      })}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <BackButton onClick={onBack}>← Back to vehicles</BackButton>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {showErrors && !allComplete && (
            <span style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: "#D81E32" }}>
              {!ownerComplete ? "Attach your remaining personal documents." : "Attach every vehicle's remaining documents."}
            </span>
          )}
          <PrimaryButton onClick={handleContinue}>Continue to review</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

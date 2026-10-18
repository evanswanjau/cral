import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { O } from "../components/onboarding/styles.js";
import { DOC_STATE, STATUS } from "../components/portal/status.js";
import { Modal } from "../components/portal/Modal.js";
import { useToast } from "../components/portal/Toast.js";
import { DriverFields, driverFormMissing, type DriverFormValue } from "../components/driver/DriverFields.js";
import {
  DRIVER_DOC_LABELS,
  DRIVER_DOC_ORDER,
  driverRateLine,
  useDeleteDriver,
  useDriver,
  useDriverAction,
  useUpdateDriver,
  useUploadDriverDocument,
  type Driver,
  type DriverDocKind,
} from "../lib/drivers-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

const EDITABLE = ["draft", "action", "rejected"];

function toForm(d: Driver): DriverFormValue {
  const kes = (m: { amount: number } | null) => (m ? String(Math.round(m.amount / 100)) : "");
  return {
    full_name: d.full_name,
    phone: d.phone.replace(/^\+254/, "0"),
    national_id: d.national_id,
    kra_pin: d.kra_pin,
    licence_number: d.licence_number,
    licence_expiry: d.licence_expiry,
    county: d.county,
    daily_rate: kes(d.rates.day),
    hourly_rate: kes(d.rates.hour),
    trip_rate: kes(d.rates.trip),
  };
}

function DocRow({
  kind,
  driver,
  uploading,
  onUpload,
}: {
  kind: DriverDocKind;
  driver: Driver;
  uploading: boolean;
  onUpload: (file: File) => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const doc = driver.documents[kind];
  const state = doc?.review_state ?? "missing";
  const d = DOC_STATE[state];
  const fromAccount = driver.is_account_holder && kind !== "driving_licence";
  let sub = doc ? doc.original_name : "Not uploaded yet";
  if (fromAccount) sub = doc ? "From your account documents" : "Add it under Settings - My profile";
  if (state === "rejected") sub = doc?.review_note ? `Rejected: ${doc.review_note}` : "Rejected by the reviewer";
  const canUpload = !fromAccount && (EDITABLE.includes(driver.status) || state === "missing" || state === "rejected" || state === "expiring");

  return (
    <div style={P.docRow}>
      <span style={{ ...P.docRowDot, background: d.core }} />
      <div style={{ flex: 1, minWidth: "min(100%,170px)" }}>
        <div style={P.docRowTitle}>{DRIVER_DOC_LABELS[kind]}</div>
        <div style={{ ...P.docRowSub, color: state === "rejected" ? "#A50E22" : "#838C9B" }}>{sub}</div>
      </div>
      <span style={{ ...P.docRowState, color: d.fg }}>{d.label}</span>
      {canUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading}
            style={{
              ...P.docRowBtn,
              background: state === "rejected" ? "#D81E32" : "#FFFFFF",
              color: state === "rejected" ? "#FFFFFF" : "#0F23A8",
              borderColor: state === "rejected" ? "#D81E32" : "#CDD2DA",
            }}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : doc ? "Replace" : "Upload"}
          </button>
        </>
      )}
    </div>
  );
}

export function DriverDetail(): JSX.Element {
  const { driverId } = useParams();
  const navigate = useNavigate();
  const flash = useToast();
  const { data: d, isPending, error } = useDriver(driverId);
  usePageTitle(d ? d.full_name : "Driver");

  const update = useUpdateDriver(driverId ?? "");
  const upload = useUploadDriverDocument(driverId ?? "");
  const submit = useDriverAction(driverId ?? "", "submit");
  const pause = useDriverAction(driverId ?? "", "pause");
  const resume = useDriverAction(driverId ?? "", "resume");
  const remove = useDeleteDriver(driverId ?? "");

  const [modal, setModal] = useState<null | "edit" | "delete">(null);
  const [form, setForm] = useState<DriverFormValue | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<DriverDocKind | null>(null);

  if (isPending) return <div style={{ color: "#838C9B" }}>Loading…</div>;
  if (error || !d) {
    return (
      <div>
        <button type="button" style={P.backLink} onClick={() => navigate("/drivers")}>← All drivers</button>
        <p style={P.lede}>That driver isn't on your account.</p>
      </div>
    );
  }

  const meta = STATUS[d.status];
  const identityLocked = !EDITABLE.includes(d.status);
  const fail = (err: unknown) => flash(err instanceof Error ? err.message : "Something went wrong. Try again.", "#FF8A8A");

  function openEdit() {
    setForm(toForm(d!));
    setShowErrors(false);
    setModal("edit");
  }

  function saveEdit() {
    if (!form) return;
    if (driverFormMissing(form)) {
      setShowErrors(true);
      return;
    }
    // Once a reviewer has the identity fields, only county and rates go up.
    const body = identityLocked
      ? { county: form.county, daily_rate: form.daily_rate, hourly_rate: form.hourly_rate, trip_rate: form.trip_rate }
      : form;
    update.mutate(body, {
      onSuccess: () => {
        setModal(null);
        flash("Driver saved.", "#57D69E");
      },
      onError: fail,
    });
  }

  return (
    <div>
      <button type="button" style={P.backLink} onClick={() => navigate("/drivers")}>← All drivers</button>

      <div style={P.mastCard}>
        <div style={P.mastTop}>
          <div>
            <div style={P.mastTagRow}>
              <span style={{ ...P.mastStatus, background: meta.tint, border: `1px solid ${meta.border}`, color: meta.text }}>
                <span style={{ ...P.mastStatusDot, background: meta.core }} />
                {meta.label}
              </span>
              {d.licence_expired && (
                <span style={{ ...P.mastStatus, background: "#FDE7EA", border: "1px solid #F7BDC5", color: "#A50E22" }}>LICENCE EXPIRED</span>
              )}
            </div>
            <h1 style={P.mastH1}>{d.full_name}</h1>
            <div style={P.mastSub}>{d.county} · {d.phone} · {driverRateLine(d) || "No rate yet"}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={P.mastRefLabel}>LICENCE</div>
            <div style={P.mastRef}>{d.licence_number}</div>
          </div>
        </div>
        <div style={P.mastActions}>
          {d.status === "draft" && (
            <button
              type="button"
              style={{ ...P.actionBtn, background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" }}
              disabled={submit.isPending}
              onClick={() => submit.mutate(undefined, { onSuccess: () => flash("Sent for review.", "#57D69E"), onError: fail })}
            >
              {submit.isPending ? "Sending…" : "Send for review"}
            </button>
          )}
          <button type="button" style={P.actionBtn} onClick={openEdit}>
            {identityLocked ? "Edit rates & county" : "Edit details"}
          </button>
          {(d.status === "live" || d.status === "paused") && (
            <button
              type="button"
              style={P.actionBtn}
              onClick={() =>
                (d.status === "live" ? pause : resume).mutate(undefined, {
                  onSuccess: () => flash(d.status === "live" ? "Paused - not bookable." : "Taking bookings again.", "#8C97A8"),
                  onError: fail,
                })
              }
            >
              {d.status === "live" ? "Pause bookings" : "Take bookings again"}
            </button>
          )}
          <button type="button" style={P.deleteBtn} onClick={() => setModal("delete")}>Remove driver</button>
        </div>
      </div>

      {d.reviewer_note && (d.status === "action" || d.status === "rejected") && (
        <div style={{ ...P.noteCard, marginTop: 16 }}>
          <div style={{ ...P.noteBar, background: meta.core }} />
          <div style={P.noteBody}>
            <div style={P.noteKickerRow}>
              <span style={{ ...P.noteRule, background: "#D81E32" }} />
              <span style={P.noteKicker}>NOTE FROM THE REVIEWER</span>
            </div>
            <p style={P.noteText}>{d.reviewer_note}</p>
          </div>
        </div>
      )}

      <div style={{ ...P.card, marginTop: 16, maxWidth: 820 }}>
        <div style={P.cardHead}>
          <span style={P.cardTitle}>Documents</span>
          <span style={{ ...P.cardHeadTag, color: d.doc_count === 3 ? "#5A6373" : "#8A5200" }}>{d.doc_count} OF 3</span>
        </div>
        {DRIVER_DOC_ORDER.map((kind) => (
          <DocRow
            key={kind}
            kind={kind}
            driver={d}
            uploading={uploadingKind === kind}
            onUpload={(file) => {
              setUploadingKind(kind);
              upload.mutate(
                { kind, file, expiresAt: kind === "driving_licence" ? d.licence_expiry : undefined },
                {
                  onSuccess: () => flash(`${DRIVER_DOC_LABELS[kind]} uploaded.`, "#6FC8F0"),
                  onError: fail,
                  onSettled: () => setUploadingKind(null),
                },
              );
            }}
          />
        ))}
        <div style={P.cardFoot}>Photos from your phone are fine, as long as every corner is readable.</div>
      </div>

      {modal === "edit" && form && (
        <Modal
          title={identityLocked ? "Rates and county" : "Driver details"}
          {...(identityLocked ? { sub: "A reviewer has their identity details - those stay as submitted." } : {})}
          width={720}
          onClose={() => setModal(null)}
          onConfirm={saveEdit}
          ctaLabel={update.isPending ? "Saving…" : "Save"}
          ctaDisabled={update.isPending}
        >
          <DriverFields value={form} onChange={setForm} showErrors={showErrors} identityLocked={identityLocked} />
          {showErrors && <div style={{ ...O.fieldError, marginTop: 10 }}>Check the highlighted fields.</div>}
        </Modal>
      )}

      {modal === "delete" && (
        <Modal
          title={`Remove ${d.full_name}?`}
          sub="Their documents are deleted too. A driver with bookings can't be removed - pause them instead."
          onClose={() => setModal(null)}
          onConfirm={() =>
            remove.mutate(undefined, {
              onSuccess: () => {
                flash("Driver removed.", "#8C97A8");
                navigate("/drivers");
              },
              onError: (err) => {
                setModal(null);
                fail(err);
              },
            })
          }
          ctaLabel={remove.isPending ? "Removing…" : "Remove driver"}
          ctaBg="#D81E32"
          ctaDisabled={remove.isPending}
        >
          <p style={{ ...P.lede, margin: 0 }}>This can't be undone.</p>
        </Modal>
      )}
    </div>
  );
}

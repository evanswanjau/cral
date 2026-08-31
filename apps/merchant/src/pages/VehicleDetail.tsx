import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ImageSquare } from "@phosphor-icons/react/dist/ssr/ImageSquare";
import { O } from "../components/onboarding/styles.js";
import { P } from "../components/portal/styles.js";
import { DOC_LABELS, DOC_ORDER, DOC_STATE, OWNER_DOC_LABELS, OWNER_DOC_ORDER, STATUS, TONE, docStateLabel, money } from "../components/portal/status.js";
import { Modal } from "../components/portal/Modal.js";
import { useToast } from "../components/portal/Toast.js";
import { usePhotoPreview } from "../lib/use-photo-preview.js";
import { ApiClientError } from "../lib/api.js";
import { toE164 } from "../lib/device.js";
import { vehicleTypeLabel } from "../lib/vehicle-categories.js";
import { COUNTIES } from "../lib/kenya.js";
import {
  useDeleteVehicle,
  useDeleteVehicleDocument,
  useDeleteVehiclePhoto,
  useDuplicateVehicle,
  useMessageReviewer,
  usePauseVehicle,
  useRequestVerification,
  useResumeVehicle,
  useSubmitVehicle,
  useUpdatePriceAvailability,
  useUploadVehicleDocument,
  useUploadVehiclePhoto,
  useVehicleDetail,
  type VehicleDetail as VehicleDetailData,
  type VehicleDocInfo,
  type VehicleStatus,
} from "../lib/vehicles-api.js";

type ModalKind = "price" | "message" | "verify" | "delete" | null;
type DocKind = keyof typeof DOC_LABELS;
type OwnerDocKind = keyof typeof OWNER_DOC_LABELS;

/** A listing with a reviewer holding it — nothing to edit or discuss until they've had a first look. */
function isPriceLocked(status: VehicleStatus): boolean {
  return status === "pending";
}

/** Nothing to discuss with a reviewer who hasn't looked at the listing yet — draft (no reviewer assigned) or pending (not opened). */
function isMessageLocked(status: VehicleStatus): boolean {
  return status === "draft" || status === "pending";
}

/** M-Pesa numbers are stored however the merchant typed them at onboarding — always show the full +254 form here, never the bare national digits. */
function formatMpesaNumber(detail: string | null): string | null {
  if (!detail) return null;
  return toE164(detail);
}

/** Today, local time, as the date input's `min` needs it (YYYY-MM-DD) — same as onboarding's Documents.tsx. */
function todayIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
}

function DocRow({
  kind,
  info,
  vehicleStatus,
  onUpload,
  onRemove,
  uploading,
  removing,
}: {
  kind: DocKind;
  info: VehicleDocInfo | null;
  vehicleStatus: VehicleStatus;
  onUpload: (file: File, expiresAt?: string) => void;
  onRemove: (documentId: string) => void;
  uploading: boolean;
  removing: boolean;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [expiry, setExpiry] = useState("");
  const state = info?.review_state ?? "missing";
  const d = DOC_STATE[state];
  const label = docStateLabel(state, vehicleStatus);
  const [title, fallbackSub] = DOC_LABELS[kind];
  let sub = fallbackSub;
  if (info?.expires_at) sub = (state === "expiring" ? "Expires " : "Valid to ") + new Date(info.expires_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  if (state === "missing") sub = "Not uploaded yet";
  if (state === "rejected") sub = "Rejected by the reviewer";
  // Still building the draft — every document stays freely replaceable and
  // removable, not just the ones the design's `needs` flag would normally
  // put a button on (missing/rejected/expiring).
  const canManage = vehicleStatus === "draft";
  const needsBtn = canManage || state === "missing" || state === "rejected" || state === "expiring";
  const showExpiry = kind === "comprehensive_insurance" && (needsBtn || canManage);

  return (
    <div style={P.docRow}>
      <span style={{ ...P.docRowDot, background: d.core }} />
      <div style={{ flex: 1, minWidth: 170 }}>
        <div style={P.docRowTitle}>{title}</div>
        <div style={{ ...P.docRowSub, color: state === "rejected" ? "#A50E22" : state === "expiring" ? "#8A5200" : "#838C9B" }}>{sub}</div>
        {showExpiry && (
          <div style={O.expiryRow}>
            <div>
              <label style={O.expiryLabel}>
                Expiry date<span style={O.required}> *</span>
              </label>
              <input
                type="date"
                value={expiry}
                min={todayIso()}
                onChange={(e) => setExpiry(e.target.value)}
                style={O.expiryInput}
              />
            </div>
            <div style={O.expiryHelper}>We flag the listing before it runs out.</div>
          </div>
        )}
      </div>
      <span style={{ ...P.docRowState, color: d.fg }}>{label}</span>
      {needsBtn && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file, kind === "comprehensive_insurance" ? expiry || undefined : undefined);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading || removing}
            style={{
              ...P.docRowBtn,
              background: state === "rejected" ? "#D81E32" : "#FFFFFF",
              color: state === "rejected" ? "#FFFFFF" : "#0F23A8",
              borderColor: state === "rejected" ? "#D81E32" : "#CDD2DA",
            }}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : state === "missing" ? "Upload" : "Replace"}
          </button>
          {canManage && info && (
            <button
              type="button"
              disabled={uploading || removing}
              style={P.docRowRemoveBtn}
              onClick={() => onRemove(info.document_id)}
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Owner-level documents are uploaded once during onboarding — this screen only ever displays their state, never re-uploads them. */
function OwnerDocRow({ kind, info, vehicleStatus }: { kind: OwnerDocKind; info: VehicleDocInfo | null; vehicleStatus: VehicleStatus }): JSX.Element {
  const state = info?.review_state ?? "missing";
  const d = DOC_STATE[state];
  const label = docStateLabel(state, vehicleStatus);
  const [title, fallbackSub] = OWNER_DOC_LABELS[kind];
  const sub = state === "missing" ? "Not uploaded yet" : state === "rejected" ? "Rejected by the reviewer" : fallbackSub;
  return (
    <div style={P.docRow}>
      <span style={{ ...P.docRowDot, background: d.core }} />
      <div style={{ flex: 1, minWidth: 170 }}>
        <div style={P.docRowTitle}>{title}</div>
        <div style={{ ...P.docRowSub, color: state === "rejected" ? "#A50E22" : "#838C9B" }}>{sub}</div>
      </div>
      <span style={{ ...P.docRowState, color: d.fg }}>{label}</span>
    </div>
  );
}

/** One photo slot — a real thumbnail once its bytes are back from the server, an "Add photos" tile while empty. */
function PhotoSlot({
  photo,
  variant,
  onAdd,
  onRemove,
  canManage,
  uploading,
  removing,
}: {
  photo: { document_id: string; original_name: string } | undefined;
  variant: "main" | "thumb";
  onAdd: () => void;
  onRemove: () => void;
  canManage: boolean;
  uploading: boolean;
  removing: boolean;
}): JSX.Element {
  const preview = usePhotoPreview(photo?.document_id);
  const boxStyle = variant === "main" ? P.photoMain : P.photoThumb;
  const imgStyle = variant === "main" ? P.photoMainImg : P.photoThumbImg;

  if (photo) {
    return (
      <div style={boxStyle}>
        {preview ? (
          <img src={preview} alt={photo.original_name} style={imgStyle} />
        ) : (
          <ImageSquare size={variant === "main" ? 34 : 22} weight="fill" color="#CDD2DA" />
        )}
        {canManage && (
          <button
            type="button"
            aria-label="Remove photo"
            disabled={removing}
            onClick={onRemove}
            style={{ ...P.photoRemove, opacity: removing ? 0.6 : 1 }}
          >
            {removing ? "…" : "✕"}
          </button>
        )}
      </div>
    );
  }

  return variant === "main" ? (
    <button type="button" style={P.photoAdd} onClick={onAdd} disabled={uploading}>
      <span style={P.photoAddLabel}>{uploading ? "Uploading…" : "Add photos"}</span>
      <span style={P.photoAddHint}>AT LEAST 3 · 3/4 FRONT, INTERIOR, REAR</span>
    </button>
  ) : (
    <button type="button" style={P.photoAddSmall} onClick={onAdd} disabled={uploading}>
      {uploading ? "…" : "Add photo"}
    </button>
  );
}

function PriceModal({ v, onClose }: { v: VehicleDetailData; onClose: () => void }): JSX.Element {
  const flash = useToast();
  const update = useUpdatePriceAvailability(v.id);
  const [rate, setRate] = useState(v.daily_rate ? String(Math.round(v.daily_rate.amount / 100)) : "");
  const [minDays, setMinDays] = useState(String(v.minimum_hire_days));
  const [county, setCounty] = useState(v.county ?? "");
  const [loc, setLoc] = useState(v.pickup_address ?? "");
  const [driver, setDriver] = useState(v.chauffeured);

  const rateNum = parseInt(rate.replace(/[^0-9]/g, ""), 10) || 0;
  const comm = Math.round(rateNum * 0.1);
  const net = rateNum - comm;
  const days = Math.max(1, parseInt(minDays, 10) || 1);

  return (
    <Modal
      title="Price & availability"
      sub="Changes show on your listing straight away. Bookings already confirmed keep their agreed rate."
      onClose={onClose}
      ctaLabel={update.isPending ? "Saving…" : "Save changes"}
      ctaDisabled={update.isPending}
      onConfirm={() => {
        update.mutate(
          { daily_rate: String(rateNum), minimum_hire_days: days, county, pickup_address: loc, chauffeured: driver },
          {
            onSuccess: () => {
              onClose();
              flash(`Saved. KES ${money(rateNum * 100)} a day.`);
            },
          },
        );
      }}
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div style={P.fieldGrid}>
          <div>
            <label style={P.fieldLabel}>Daily rate (KES)</label>
            <input style={P.fieldInput} value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <label style={P.fieldLabel}>Minimum hire (days)</label>
            <input style={P.fieldInput} value={minDays} onChange={(e) => setMinDays(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        <div style={P.fieldGrid}>
          <div>
            <label style={P.fieldLabel}>County</label>
            <select style={P.fieldInputText} value={county} onChange={(e) => setCounty(e.target.value)}>
              <option value="">Select a county</option>
              {COUNTIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={P.fieldLabel}>Pick-up address</label>
            <input style={P.fieldInputText} value={loc} onChange={(e) => setLoc(e.target.value)} />
          </div>
        </div>
        <div style={P.toggleRow}>
          <div>
            <div style={P.toggleRowTitle}>Chauffeured</div>
            <div style={P.toggleRowSub}>
              {driver ? "Only your driver can drive this vehicle." : "The hirer drives this vehicle themselves. No driver is included."}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDriver((d) => !d)}
            style={{ ...P.toggleTrack, background: driver ? "#0F23A8" : "#CDD2DA", justifyContent: driver ? "flex-end" : "flex-start" }}
          >
            <span style={P.toggleThumb} />
          </button>
        </div>
        <div style={P.breakdown}>
          <div style={P.breakdownRow}>
            <span style={P.breakdownKey}>Hirer pays, per day</span>
            <span style={P.breakdownVal}>{rateNum ? `KES ${money(rateNum * 100)}` : "—"}</span>
          </div>
          <div style={{ ...P.breakdownRow, ...P.breakdownRowTop }}>
            <span style={P.breakdownKey}>CRAL commission · 10%</span>
            <span style={{ ...P.breakdownVal, color: "#A50E22" }}>{rateNum ? `− KES ${money(comm * 100)}` : "—"}</span>
          </div>
          <div style={P.breakdownNet}>
            <span style={P.breakdownNetKey}>You keep, per day</span>
            <span style={P.breakdownNetVal}>
              <span style={P.breakdownNetPrefix}>KES</span> {rateNum ? money(net * 100) : "—"}
            </span>
          </div>
          <div style={P.breakdownNote}>
            {rateNum
              ? `A ${days}-day hire pays you KES ${money(net * days * 100)} — KES ${money(rateNum * days * 100)} less KES ${money(comm * days * 100)} commission.`
              : "Type a daily rate to see what you keep."}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function MessageModal({ v, onClose }: { v: VehicleDetailData; onClose: () => void }): JSX.Element {
  const flash = useToast();
  const send = useMessageReviewer(v.id);
  const [msg, setMsg] = useState("");

  return (
    <Modal
      title="Message the reviewer"
      sub="Goes to the compliance reviewer handling this vehicle, with the listing reference attached."
      onClose={onClose}
      ctaLabel={send.isPending ? "Sending…" : "Send message"}
      ctaDisabled={send.isPending}
      onConfirm={() => {
        if (!msg.trim()) {
          flash("Write a message first.", "#FFC46B");
          return;
        }
        send.mutate(msg.trim(), {
          onSuccess: () => {
            onClose();
            flash("Sent. Replies come by SMS and email.", "#6FC8F0");
          },
        });
      }}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div style={P.reviewerCardRow}>
          <span style={P.reviewerAvatar}>CR</span>
          <div>
            <div style={{ font: "600 13px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>Compliance review team</div>
            <div style={{ font: "400 11px/1.3 'IBM Plex Mono',monospace", color: "#838C9B" }}>RE: {v.listing_ref} · {v.registration}</div>
          </div>
        </div>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="The insurance certificate is being renewed this week — the broker will email it by Friday."
          style={P.textarea}
        />
        <div style={P.helperText}>Replies arrive by SMS and email. Typical response time is one working day.</div>
      </div>
    </Modal>
  );
}

function VerifyModal({ v, onClose }: { v: VehicleDetailData; onClose: () => void }): JSX.Element {
  const flash = useToast();
  const verify = useRequestVerification(v.id);
  const phone = v.payout.method === "mpesa" ? formatMpesaNumber(v.payout.detail) : null;

  return (
    <Modal
      title="Verified badge"
      sub="A paid, optional service — separate from the free document review."
      onClose={onClose}
      ctaLabel={verify.isPending ? "Sending…" : "Send M-Pesa request"}
      ctaDisabled={verify.isPending}
      onConfirm={() => {
        verify.mutate(undefined, {
          onSuccess: () => {
            onClose();
            flash("M-Pesa request sent — enter your PIN on the prompt.", "#FFC46B");
          },
        });
      }}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div style={P.verifyFeeCard}>
          <div>
            <div style={P.verifyFeeLabel}>ONE VEHICLE · ONE YEAR</div>
            <div style={P.verifyFeeAmount}>
              <span style={P.verifyFeePrefix}>KES</span> 1,500
            </div>
          </div>
          <span style={P.verifyPill}>✓ VERIFIED PILL</span>
        </div>
        <div style={P.verifyPoints}>
          <div style={P.verifyPoint}>
            <span style={{ ...P.verifyPointDot, background: "#0B8A5B" }} />
            <div style={P.verifyPointText}>An agent visits the vehicle and confirms it is the one in your photos and logbook.</div>
          </div>
          <div style={P.verifyPoint}>
            <span style={{ ...P.verifyPointDot, background: "#0B8A5B" }} />
            <div style={P.verifyPointText}>The badge sits on your listing for twelve months and lifts you in search results.</div>
          </div>
          <div style={P.verifyPoint}>
            <span style={{ ...P.verifyPointDot, background: "#A7AEBB" }} />
            <div style={P.verifyPointText}>It is not a mechanical inspection, and it is separate from the free document review.</div>
          </div>
        </div>
        <div style={P.verifyNotice}>
          We will send an M-Pesa request to <strong style={{ fontWeight: 600 }}>{phone ?? "your payout number"}</strong>. Nothing is charged until you enter your PIN.
        </div>
      </div>
    </Modal>
  );
}

function DeleteModal({ v, onClose, onDeleted }: { v: VehicleDetailData; onClose: () => void; onDeleted: () => void }): JSX.Element {
  const flash = useToast();
  const del = useDeleteVehicle(v.id);
  const [confirm, setConfirm] = useState("");
  const normalize = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");
  const ok = normalize(confirm) === normalize(v.registration);

  return (
    <Modal
      title="Delete this vehicle?"
      onClose={onClose}
      ctaLabel={del.isPending ? "Deleting…" : "Delete permanently"}
      ctaBg={ok ? "#D81E32" : "#E9A4AE"}
      ctaDisabled={!ok || del.isPending}
      width={480}
      onConfirm={() => {
        if (!ok) {
          flash("Type the registration exactly to confirm.", "#FF8A8A");
          return;
        }
        del.mutate(confirm, {
          onSuccess: () => {
            flash(`${v.registration} deleted.`, "#FF8A8A");
            onDeleted();
          },
        });
      }}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div style={P.deleteWarn}>
          <span style={P.deleteWarnPlate}>{v.registration}</span>
          <div style={P.deleteWarnTitle}>{v.make} {v.model}</div>
        </div>
        <div style={P.deleteBody}>
          Its documents, photos and review history go with it. Bookings already completed stay in your payout records. This cannot be undone.
        </div>
        <div>
          <label style={P.fieldLabel}>Type the registration to confirm</label>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={v.registration}
            style={{ ...P.fieldInput, letterSpacing: ".05em" }}
          />
        </div>
      </div>
    </Modal>
  );
}

export function VehicleDetail(): JSX.Element {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();
  const flash = useToast();
  const { data: v, isPending } = useVehicleDetail(vehicleId);
  const [modal, setModal] = useState<ModalKind>(null);
  const pause = usePauseVehicle(vehicleId ?? "");
  const resume = useResumeVehicle(vehicleId ?? "");
  const duplicate = useDuplicateVehicle(vehicleId ?? "");
  const submit = useSubmitVehicle(vehicleId ?? "");
  const uploadDoc = useUploadVehicleDocument(vehicleId ?? "");
  const removeDoc = useDeleteVehicleDocument(vehicleId ?? "");
  const uploadPhoto = useUploadVehiclePhoto(vehicleId ?? "");
  const removePhoto = useDeleteVehiclePhoto(vehicleId ?? "");
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Every upload/remove above shares one mutation instance across every
  // row — tracking *which* row is busy locally is what stops every other
  // document/photo from showing a loading state whenever any one of them
  // is uploading.
  const [uploadingDocKind, setUploadingDocKind] = useState<DocKind | null>(null);
  const [removingDocId, setRemovingDocId] = useState<string | null>(null);
  const [uploadingPhotoSlot, setUploadingPhotoSlot] = useState<number | null>(null);
  const [removingPhotoId, setRemovingPhotoId] = useState<string | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);

  if (isPending || !v) return <div />;

  const meta = STATUS[v.status];
  const canPause = v.status === "live" || v.status === "paused";
  const canVerify = v.status === "live" || v.status === "paused";
  const badgeActive = v.verification_badge === "active";
  const badgePending = v.verification_badge === "pending";
  const photoCount = v.photos.length;
  const priceLocked = isPriceLocked(v.status);
  const messageLocked = isMessageLocked(v.status);
  const canManagePhotos = v.status === "draft";

  const submitBlockers: string[] = [];
  if (!v.daily_rate) submitBlockers.push("a daily rate");
  if (v.doc_count < 3 || v.doc_has_issue) submitBlockers.push("all three documents");
  if (photoCount < 3) submitBlockers.push("at least three photos");
  const canSubmit = v.status === "draft" && submitBlockers.length === 0;

  function handleAddPhotoClick(slot: number) {
    if (photoCount >= 3) return;
    setUploadingPhotoSlot(slot);
    photoInputRef.current?.click();
  }

  const upsell = badgeActive
    ? {
        kicker: "VERIFIED · IMETHIBITISHWA",
        title: "This vehicle carries the badge",
        body: `An agent confirmed it in person. The pill shows on your listing until ${v.verification_badge_expires_at ? new Date(v.verification_badge_expires_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : ""}. We will remind you a month before it lapses.`,
        cta: "Renewal handled",
        note: "KES 1,500 / YEAR",
        opacity: 0.45,
      }
    : badgePending
      ? {
          kicker: "VERIFICATION · PENDING",
          title: "M-Pesa request sent",
          body: `Enter your PIN on the prompt sent to ${formatMpesaNumber(v.payout.detail) ?? "your payout number"}. Once it clears, an agent will call to arrange the visit.`,
          cta: "Resend request",
          note: "KES 1,500 REQUESTED",
          opacity: 1,
        }
      : canVerify
        ? {
            kicker: "OPTIONAL · PAID",
            title: "Get the verified badge",
            body: "We visit and confirm this is the vehicle you posted. Verified listings sit higher in search and get booked more often. Not a mechanical inspection.",
            cta: "Verify for KES 1,500",
            note: "PER VEHICLE / YEAR",
            opacity: 1,
          }
        : {
            kicker: "OPTIONAL · PAID",
            title: "Get the verified badge",
            body: "Available once your listing has been approved and is live — not while it's still with a reviewer.",
            cta: "Verify for KES 1,500",
            note: "AVAILABLE ONCE APPROVED",
            opacity: 0.45,
          };

  return (
    <div>
      <button type="button" style={P.backLink} onClick={() => navigate("/vehicles")}>
        ← All vehicles
      </button>

      <div style={P.mastCard}>
        <div style={P.mastTop}>
          <div>
            <div style={P.mastTagRow}>
              <span style={P.mastPlate}>{v.registration}</span>
              <span style={{ ...P.mastStatus, background: meta.tint, border: `1px solid ${meta.border}`, color: meta.text }}>
                <span style={{ ...P.mastStatusDot, background: meta.core }} />
                {meta.label}
              </span>
              {badgeActive && (
                <span style={P.mastVerified}>
                  ✓ VERIFIED · {v.verification_badge_expires_at ? new Date(v.verification_badge_expires_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" }).toUpperCase() : ""}
                </span>
              )}
            </div>
            <h1 style={P.mastH1}>{v.make} {v.model}</h1>
            <div style={P.mastSub}>{vehicleTypeLabel(v.type)} · {v.year} · {v.transmission} · {v.seats} seats · {v.county ?? v.pickup_address ?? "—"}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={P.mastRefLabel}>LISTING REF</div>
            <div style={P.mastRef}>{v.listing_ref}</div>
          </div>
        </div>

        <div style={P.mastActions}>
          <button
            type="button"
            style={{ ...P.actionBtn, cursor: priceLocked ? "not-allowed" : "pointer", opacity: priceLocked ? 0.45 : 1 }}
            onClick={() => {
              if (priceLocked) {
                flash("This listing is with a reviewer — you can edit it again once they've had a first look.", "#8C97A8");
                return;
              }
              setModal("price");
            }}
          >
            Edit price &amp; availability
          </button>
          <button
            type="button"
            style={{ ...P.actionBtn, cursor: canPause ? "pointer" : "not-allowed", opacity: canPause ? 1 : 0.45 }}
            onClick={() => {
              if (!canPause) {
                flash("Only a live listing can be taken down.", "#8C97A8");
                return;
              }
              if (v.status === "paused") {
                resume.mutate(undefined, { onSuccess: () => flash(`${v.registration} is live again.`, "#57D69E") });
              } else {
                pause.mutate(undefined, { onSuccess: () => flash(`${v.registration} is hidden from search.`, "#8C97A8") });
              }
            }}
          >
            {v.status === "paused" ? "Put back on the market" : "Take listing down"}
          </button>
          <button
            type="button"
            style={{ ...P.actionBtn, cursor: messageLocked ? "not-allowed" : "pointer", opacity: messageLocked ? 0.45 : 1 }}
            onClick={() => {
              if (messageLocked) {
                flash(
                  v.status === "draft"
                    ? "There's no reviewer assigned until you submit this listing."
                    : "This listing is with a reviewer — there's nothing to discuss until they've had a first look.",
                  "#8C97A8",
                );
                return;
              }
              setModal("message");
            }}
          >
            Message the reviewer
          </button>
          <button
            type="button"
            style={P.actionBtn}
            onClick={() =>
              duplicate.mutate(undefined, {
                onSuccess: (copy) => {
                  flash("Draft created — each vehicle needs its own logbook and insurance.", "#6FC8F0");
                  navigate(`/vehicles/${copy.id}`);
                },
              })
            }
          >
            Duplicate
          </button>
          <button type="button" style={P.deleteBtn} onClick={() => setModal("delete")}>Delete vehicle</button>
        </div>
      </div>

      <div style={P.detailBody}>
        <div style={P.detailMain}>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                uploadPhoto.mutate(file, {
                  onError: () => flash("Couldn't upload that photo. Try again.", "#FF8A8A"),
                  onSettled: () => setUploadingPhotoSlot(null),
                });
              } else {
                setUploadingPhotoSlot(null);
              }
              e.target.value = "";
            }}
          />
          <div style={P.photoGrid}>
            <PhotoSlot
              photo={v.photos[0]}
              variant="main"
              onAdd={() => handleAddPhotoClick(0)}
              onRemove={() => {
                const doc = v.photos[0];
                if (!doc) return;
                setRemovingPhotoId(doc.document_id);
                removePhoto.mutate(doc.document_id, { onSettled: () => setRemovingPhotoId(null) });
              }}
              canManage={canManagePhotos}
              uploading={uploadingPhotoSlot === 0}
              removing={removingPhotoId === v.photos[0]?.document_id}
            />
            <div style={P.photoThumbs}>
              {[1, 2].map((slot) => (
                <PhotoSlot
                  key={slot}
                  photo={v.photos[slot]}
                  variant="thumb"
                  onAdd={() => handleAddPhotoClick(slot)}
                  onRemove={() => {
                    const doc = v.photos[slot];
                    if (!doc) return;
                    setRemovingPhotoId(doc.document_id);
                    removePhoto.mutate(doc.document_id, { onSettled: () => setRemovingPhotoId(null) });
                  }}
                  canManage={canManagePhotos}
                  uploading={uploadingPhotoSlot === slot}
                  removing={removingPhotoId === v.photos[slot]?.document_id}
                />
              ))}
            </div>
          </div>

          {v.reviewer_note && (
            <div style={P.noteCard}>
              <div style={{ ...P.noteBar, background: v.reviewer_note_resolved ? "#E4E7EC" : meta.core }} />
              <div style={P.noteBody}>
                <div style={P.noteKickerRow}>
                  <span style={{ ...P.noteRule, background: v.reviewer_note_resolved ? "#CDD2DA" : "#D81E32" }} />
                  <span style={P.noteKicker}>{v.reviewer_note_resolved ? "EARLIER NOTE · ANSWERED" : "NOTE FROM THE REVIEWER"}</span>
                </div>
                <p style={{ ...P.noteText, color: v.reviewer_note_resolved ? "#838C9B" : "#333B4A" }}>{v.reviewer_note}</p>
                <span style={P.noteMeta}>{v.reviewer_note_meta}{v.reviewer_note_resolved ? " · answered" : ""}</span>
              </div>
            </div>
          )}

          <div style={P.card}>
            <div style={P.cardHead}>
              <span style={P.cardTitle}>Documents</span>
              <span style={{ ...P.cardHeadTag, color: v.doc_count === 3 ? "#5A6373" : "#8A5200" }}>{v.doc_count} OF 3 UPLOADED</span>
            </div>
            {v.merchant_approved ? (
              <div style={P.ownerStrip}>
                <span style={P.ownerStripDot}>✓</span>
                <span style={P.ownerStripText}>
                  <span style={{ fontWeight: 600, color: "#076945" }}>{v.merchant_name ?? "You"} {v.merchant_name ? "is an approved merchant." : "are an approved merchant."}</span>{" "}
                  Certificate of incorporation, company KRA PIN and director ID were accepted
                  {v.owner_documents_uploaded_at ? ` on ${new Date(v.owner_documents_uploaded_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                  {" "}— you never upload those again. Every vehicle needs only these three.
                </span>
              </div>
            ) : (
              OWNER_DOC_ORDER.map((kind) => (
                <OwnerDocRow key={kind} kind={kind} info={v.owner_documents[kind]} vehicleStatus={v.status} />
              ))
            )}
            {DOC_ORDER.map((kind) => (
              <DocRow
                key={kind}
                kind={kind}
                info={v.documents[kind]}
                vehicleStatus={v.status}
                uploading={uploadingDocKind === kind}
                removing={removingDocId === v.documents[kind]?.document_id}
                onUpload={(file, expiresAt) => {
                  setUploadingDocKind(kind);
                  uploadDoc.mutate(
                    { kind, file, expiresAt },
                    {
                      onSuccess: () =>
                        flash(
                          v.status === "draft"
                            ? `${DOC_LABELS[kind][0]} attached.`
                            : `${DOC_LABELS[kind][0]} uploaded — back with the reviewer.`,
                          "#6FC8F0",
                        ),
                      onSettled: () => setUploadingDocKind(null),
                    },
                  );
                }}
                onRemove={(documentId) => {
                  setRemovingDocId(documentId);
                  removeDoc.mutate(documentId, {
                    onSuccess: () => flash(`${DOC_LABELS[kind][0]} removed.`, "#8C97A8"),
                    onSettled: () => setRemovingDocId(null),
                  });
                }}
              />
            ))}
            <div style={P.cardFoot}>Photos from your phone are fine, as long as every corner is readable.</div>
          </div>

          <div style={P.card}>
            <div style={P.cardHead}>
              <span style={P.cardTitle}>Vehicle details</span>
              <span style={{ font: "400 12px/1.3 'Instrument Sans',sans-serif", color: "#838C9B" }}>Taken from the logbook</span>
            </div>
            <div style={P.specGrid}>
              {[
                ["MAKE", v.make],
                ["MODEL", v.model],
                ["TYPE", vehicleTypeLabel(v.type)],
                ["YEAR", v.year],
                ["SEATS", String(v.seats)],
                ["TRANSMISSION", v.transmission],
                ["FUEL", v.fuel],
                ["COLOUR", v.colour ?? "—"],
                ["COUNTY", v.county ?? "—"],
                ["BASED IN", v.pickup_address ?? "—"],
              ].map(([k, val]) => (
                <div key={k}>
                  <div style={P.specKey}>{k}</div>
                  <div style={P.specVal}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {v.status === "draft" && (
            <div>
              <button
                type="button"
                style={{ ...P.addButton, width: "100%", opacity: submit.isPending || !canSubmit ? 0.55 : 1, cursor: canSubmit ? "pointer" : "not-allowed" }}
                disabled={submit.isPending}
                onClick={() => {
                  if (!canSubmit) {
                    flash(`Add ${submitBlockers.join(", ")} before submitting.`, "#FFC46B");
                    return;
                  }
                  submit.mutate(undefined, {
                    onSuccess: () => flash("Submitted for review."),
                    onError: (err) => flash(err instanceof ApiClientError ? err.message : "Couldn't submit. Try again.", "#FF8A8A"),
                  });
                }}
              >
                {submit.isPending ? "Submitting…" : "Submit for review"}
              </button>
              {submitBlockers.length > 0 && (
                <div style={{ ...P.helperText, marginTop: 8, textAlign: "center" }}>
                  Needs {submitBlockers.join(", ")} before it can be submitted.
                </div>
              )}
            </div>
          )}
        </div>

        <div style={P.detailSide}>
          <div style={P.sideCard}>
            <div style={P.sideCardLabel}>REVIEW HISTORY</div>
            {(showAllEvents ? v.events : v.events.slice(0, 3)).map((e, i, shown) => (
              <div key={i} style={P.tlRow}>
                <div style={P.tlRail}>
                  <span style={{ ...P.tlDot, background: TONE[e.tone] }} />
                  {i < shown.length - 1 && <span style={P.tlLine} />}
                </div>
                <div style={P.tlBody}>
                  <div style={{ ...P.tlLabel, color: e.tone === "grey" ? "#333B4A" : "#0B0F1A" }}>{e.label}</div>
                  {e.body && <div style={P.tlText}>{e.body}</div>}
                  <div style={P.tlWhen}>
                    {new Date(e.occurred_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).toUpperCase()}
                  </div>
                </div>
              </div>
            ))}
            {v.events.length > 3 && (
              <button type="button" style={P.tlViewAll} onClick={() => setShowAllEvents((s) => !s)}>
                {showAllEvents ? "Show fewer" : `View all ${v.events.length}`}
              </button>
            )}
          </div>

          <div style={P.card}>
            <div style={P.priceHead}>
              <span style={P.cardTitle}>Price &amp; availability</span>
              <button
                type="button"
                style={{ ...P.priceEditBtn, opacity: priceLocked ? 0.5 : 1, cursor: priceLocked ? "not-allowed" : "pointer" }}
                onClick={() => {
                  if (priceLocked) {
                    flash("This listing is with a reviewer — you can edit it again once they've had a first look.", "#8C97A8");
                    return;
                  }
                  setModal("price");
                }}
              >
                Edit
              </button>
            </div>
            <div style={P.priceBody}>
              {[
                ["Daily rate", v.daily_rate ? `KES ${money(v.daily_rate.amount)}` : "Not set"],
                ["Minimum hire", `${v.minimum_hire_days} ${v.minimum_hire_days === 1 ? "day" : "days"}`],
                ["Driver", v.chauffeured ? "Included" : "Self-drive"],
                ["You keep per day", v.daily_rate ? `KES ${money(Math.round(v.daily_rate.amount * 0.9))}` : "—"],
              ].map(([k, val]) => (
                <div key={k} style={P.priceRow}>
                  <span style={P.priceKey}>{k}</span>
                  <span style={P.priceVal}>{val}</span>
                </div>
              ))}
            </div>
            <div style={P.cardFoot}>Commission is taken from completed bookings only.</div>
          </div>

          <div style={P.upsell}>
            <div style={P.upsellHead}>
              <span style={P.upsellRule} />
              <span style={P.upsellKicker}>{upsell.kicker}</span>
            </div>
            <div style={P.upsellTitle}>{upsell.title}</div>
            <p style={P.upsellBody}>{upsell.body}</p>
            <div style={P.upsellFoot}>
              <button
                type="button"
                style={{ ...P.upsellCta, opacity: upsell.opacity, cursor: badgeActive || (!canVerify && !badgePending) ? "default" : "pointer" }}
                onClick={() => {
                  if (badgeActive) {
                    flash(`Already verified until ${v.verification_badge_expires_at ? new Date(v.verification_badge_expires_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : ""}.`, "#57D69E");
                    return;
                  }
                  if (!badgePending && !canVerify) {
                    flash("The verified badge is only available once your listing has been approved.", "#8C97A8");
                    return;
                  }
                  setModal("verify");
                }}
              >
                {upsell.cta}
              </button>
              <span style={P.upsellNote}>{upsell.note}</span>
            </div>
          </div>

          <div style={P.payoutCard}>
            <div style={P.payoutLabel}>PAYOUT DESTINATION</div>
            <div style={P.payoutRow}>
              <span style={P.payoutAvatar}>{v.payout.method === "mpesa" ? "M" : "B"}</span>
              <div>
                <div style={P.payoutName}>
                  {v.payout.method === "mpesa" ? "M-Pesa" : "Bank"} ·{" "}
                  {v.payout.method === "mpesa" ? (formatMpesaNumber(v.payout.detail) ?? "—") : (v.payout.detail ?? "—")}
                </div>
                <div style={P.payoutSub}>{v.payout.account_name ?? "—"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {modal === "price" && <PriceModal v={v} onClose={() => setModal(null)} />}
      {modal === "message" && <MessageModal v={v} onClose={() => setModal(null)} />}
      {modal === "verify" && <VerifyModal v={v} onClose={() => setModal(null)} />}
      {modal === "delete" && (
        <DeleteModal v={v} onClose={() => setModal(null)} onDeleted={() => navigate("/vehicles")} />
      )}
    </div>
  );
}

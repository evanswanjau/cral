import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePageTitle } from "../lib/use-page-title.js";
import { P } from "../components/portal/styles.js";
import { BOOKING_STATUS, TONE, money } from "../components/portal/status.js";
import { Modal } from "../components/portal/Modal.js";
import { useToast } from "../components/portal/Toast.js";
import { ApiClientError } from "../lib/api.js";
import {
  useBookingDetail,
  useCancelBooking,
  useCompleteHandover,
  useConfirmBooking,
  useConfirmHandover,
  useCreateBookingReport,
  useCreateHandover,
  useDeclineBooking,
  useHirerHistory,
  useLogHandoverCondition,
  useRateHirer,
  useUploadHandoverPhoto,
  useVerifyHandoverOtp,
  type BookingDetail as BookingDetailData,
  type BookingReportCategory,
  type BookingReportKind,
  type DeclineBookingInput,
  type Handover,
} from "../lib/bookings-api.js";

type ModalKind = "accept" | "decline" | "cancel" | "handover" | "report" | "rate" | "hirer-history" | null;

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}

function fmtDateWithDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function durationDays(pickupAt: string, dropoffAt: string): number {
  return Math.max(1, Math.round((new Date(dropoffAt).getTime() - new Date(pickupAt).getTime()) / (24 * 60 * 60 * 1000)));
}

/** "RESPOND BY 14:00 TODAY" only when the 12h window actually falls today - a request made at 22:00 is due tomorrow, and the label needs to say so. */
function respondByLabel(iso: string): string {
  const due = new Date(iso);
  const time = due.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  const sameDay = due.toDateString() === now.toDateString();
  if (sameDay) return `RESPOND BY ${time} TODAY`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (due.toDateString() === tomorrow.toDateString()) return `RESPOND BY ${time} TOMORROW`;
  return `RESPOND BY ${fmtDate(iso)} ${time}`;
}

function hasRated(b: BookingDetailData): boolean {
  return b.events.some((e) => e.kind === "rated");
}

// ---------------------------------------------------------------------
// Accept modal
// ---------------------------------------------------------------------

function AcceptModal({ b, onClose }: { b: BookingDetailData; onClose: () => void }): JSX.Element {
  const flash = useToast();
  const confirm = useConfirmBooking(b.id);
  const days = durationDays(b.pickup_at, b.dropoff_at);

  return (
    <Modal
      title="Accept this booking?"
      sub="The dates lock on your calendar and the hirer gets your pick-up details."
      onClose={onClose}
      ctaLabel={confirm.isPending ? "Accepting…" : "Accept booking"}
      ctaDisabled={confirm.isPending}
      onConfirm={() =>
        confirm.mutate(undefined, {
          onSuccess: () => {
            onClose();
            flash("Booking accepted. Pick-up details sent to the hirer.");
          },
          onError: (err) => flash(err instanceof ApiClientError ? err.message : "Couldn't accept. Try again.", "#FF8A8A"),
        })
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div style={P.breakdown}>
          {[
            ["Hirer", b.hirer_name],
            ["Vehicle", `${b.vehicle_registration} · ${b.vehicle_make} ${b.vehicle_model}`],
            ["Dates", `${fmtDate(b.pickup_at)} → ${fmtDate(b.dropoff_at)} · ${days} days`],
            ["You keep", `KES ${money(b.merchant_net.amount)}`],
          ].map(([k, v]) => (
            <div key={k} style={{ ...P.breakdownRow, background: "#F8F9FB" }}>
              <span style={P.breakdownKey}>{k}</span>
              <span style={{ ...P.breakdownVal, fontFamily: "'Instrument Sans',sans-serif" }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={P.verifyPoints}>
          <div style={P.verifyPoint}>
            <span style={{ ...P.verifyPointDot, background: "#0B8A5B" }} />
            <div style={P.verifyPointText}>The hirer has already paid CRAL in full. Accepting locks the vehicle for these dates.</div>
          </div>
          <div style={P.verifyPoint}>
            <span style={{ ...P.verifyPointDot, background: "#0B8A5B" }} />
            <div style={P.verifyPointText}>Your money is released 24 hours after you receive the vehicle back, then paid on the next run.</div>
          </div>
          <div style={P.verifyPoint}>
            <span style={{ ...P.verifyPointDot, background: "#C77400" }} />
            <div style={P.verifyPointText}>Cancelling after you accept counts against your response record.</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Decline ("Turn it down") modal
// ---------------------------------------------------------------------

const DECLINE_REASONS: { value: DeclineBookingInput["reason_code"]; label: string }[] = [
  { value: "not_free", label: "Vehicle is not free on those dates" },
  { value: "rate_out_of_date", label: "The rate quoted is out of date" },
  { value: "hirer_needs_checking", label: "Hirer details need more checking" },
  { value: "other", label: "Something else" },
];

function DeclineModal({ b, onClose }: { b: BookingDetailData; onClose: () => void }): JSX.Element {
  const flash = useToast();
  const decline = useDeclineBooking(b.id);
  const [reason, setReason] = useState<DeclineBookingInput["reason_code"] | null>(null);
  const [note, setNote] = useState("");

  return (
    <Modal
      title="Turn down this request?"
      sub="Tell us why so we stop sending you requests you cannot take."
      onClose={onClose}
      ctaLabel={decline.isPending ? "Turning down…" : "Turn it down"}
      ctaBg="#D81E32"
      ctaDisabled={decline.isPending || !reason}
      onConfirm={() => {
        if (!reason) return;
        decline.mutate(
          { reason_code: reason, ...(note.trim() ? { note: note.trim() } : {}) },
          {
            onSuccess: () => {
              onClose();
              flash("Request turned down. The hirer has been refunded.", "#8C97A8");
            },
            onError: (err) => flash(err instanceof ApiClientError ? err.message : "Couldn't turn it down. Try again.", "#FF8A8A"),
          },
        );
      }}
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={P.fieldLabel}>Why are you turning it down?</label>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {DECLINE_REASONS.map((r) => (
              <label
                key={r.value}
                style={{
                  ...P.toggleRow,
                  justifyContent: "flex-start",
                  gap: 12,
                  cursor: "pointer",
                  border: `1px solid ${reason === r.value ? "#0F23A8" : "#E4E7EC"}`,
                  background: reason === r.value ? "#EDEFFC" : "#FFFFFF",
                }}
              >
                <input type="radio" name="decline-reason" checked={reason === r.value} onChange={() => setReason(r.value)} />
                <span style={P.toggleRowTitle}>{r.label}</span>
              </label>
            ))}
          </div>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything the hirer should know (optional)"
          style={P.textarea}
        />
        <div style={P.deleteWarn}>
          <div style={P.deleteBody}>
            The hirer is refunded in full and the dates open up again. Frequent declines push your listings down in search.
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Cancel modal
// ---------------------------------------------------------------------

function CancelModal({ b, onClose }: { b: BookingDetailData; onClose: () => void }): JSX.Element {
  const flash = useToast();
  const cancel = useCancelBooking(b.id);
  const [reason, setReason] = useState("");
  const isLate = Date.now() >= new Date(b.pickup_at).getTime();

  return (
    <Modal
      title="Cancel this booking?"
      sub={isLate ? "It's at or after pick-up time - the 25% late fee applies." : "Free for the hirer since it's before pick-up time."}
      onClose={onClose}
      ctaLabel={cancel.isPending ? "Cancelling…" : "Cancel booking"}
      ctaBg="#D81E32"
      ctaDisabled={cancel.isPending || !reason.trim()}
      onConfirm={() =>
        cancel.mutate(reason.trim(), {
          onSuccess: () => {
            onClose();
            flash("Booking cancelled.", "#8C97A8");
          },
          onError: (err) => flash(err instanceof ApiClientError ? err.message : "Couldn't cancel. Try again.", "#FF8A8A"),
        })
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ ...P.deleteWarn, background: isLate ? "#FDE7EA" : "#F1F3F6", borderColor: isLate ? "#F7BDC5" : "#E4E7EC" }}>
          <div style={{ ...P.deleteBody, color: isLate ? "#A50E22" : "#5A6373" }}>
            {isLate
              ? `A 25% cancellation fee is charged on the booking value. CRAL takes its commission from that fee and the rest is yours. The hirer is refunded the balance.`
              : "The hirer is refunded in full and nothing is owed either way."}
          </div>
        </div>
        <div>
          <label style={P.fieldLabel}>Why are you cancelling?</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} style={P.textarea} />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Handover modal - one flow for both pickup and return (spec §15: "the
// same machinery runs in reverse at return"). QR-proximity is skipped
// this phase (no customer app); the OTP step is real.
// ---------------------------------------------------------------------

function HandoverModal({ b, kind, onClose }: { b: BookingDetailData; kind: "pickup" | "return"; onClose: () => void }): JSX.Element {
  const flash = useToast();
  const [handover, setHandover] = useState<Handover | null>(null);
  const [code, setCode] = useState("");
  const [odometer, setOdometer] = useState("");
  const [fuel, setFuel] = useState<"empty" | "quarter" | "half" | "three_quarter" | "full" | "">("");
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [skippedPhotos, setSkippedPhotos] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createHandover = useCreateHandover(b.id);
  const verifyOtp = useVerifyHandoverOtp();
  const logCondition = useLogHandoverCondition();
  const uploadPhoto = useUploadHandoverPhoto();
  const confirmHandover = useConfirmHandover();
  const completeHandover = useCompleteHandover(b.id);

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    createHandover.mutate(kind, { onSuccess: setHandover, onError: () => setError("Couldn't start this handover. Try again.") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verified = handover && handover.state !== "otp_sent" && handover.state !== "created";
  const canSkipPhotos = kind === "pickup"; // a return with no pickup photos already can't file a damage claim regardless

  function handleVerify() {
    if (!handover || !code.trim()) return;
    setError(null);
    verifyOtp.mutate(
      { handoverId: handover.id, code: code.trim() },
      {
        onSuccess: setHandover,
        onError: (err) => setError(err instanceof ApiClientError ? err.message : "That code doesn't match."),
      },
    );
  }

  function handleFinish() {
    if (!handover) return;
    setError(null);
    logCondition.mutate(
      {
        handoverId: handover.id,
        input: {
          ...(odometer ? { odometer_km: Number(odometer) } : {}),
          ...(fuel ? { fuel_level: fuel } : {}),
          ...(photoIds.length ? { photo_document_ids: photoIds } : {}),
        },
      },
      {
        onSuccess: () => {
          confirmHandover.mutate(handover.id, {
            onSuccess: (confirmed) => {
              completeHandover.mutate(confirmed.id, {
                onSuccess: () => {
                  onClose();
                  flash(kind === "pickup" ? "Vehicle handed over. The hire is now active." : "Return confirmed. Your payout clears 24 hours from now.");
                },
                onError: (err) => setError(err instanceof ApiClientError ? err.message : "Couldn't complete the handover."),
              });
            },
            onError: (err) => setError(err instanceof ApiClientError ? err.message : "Couldn't confirm the handover."),
          });
        },
        onError: (err) => setError(err instanceof ApiClientError ? err.message : "Couldn't log the condition."),
      },
    );
  }

  const finishing = logCondition.isPending || confirmHandover.isPending || completeHandover.isPending;

  return (
    <div style={P.overlay} onClick={onClose}>
      <div style={{ ...P.modalBox, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div style={P.modalHead}>
          <div>
            <div style={P.modalTitle}>{kind === "pickup" ? "Start the hire" : "Confirm the return"}</div>
            <div style={P.modalSub}>
              {!verified
                ? handover?.masked_destination
                  ? `Ask the hirer for the code sent to ${handover.masked_destination}.`
                  : "Opening the handover session…"
                : "Check the vehicle over, then finish to release the next step."}
            </div>
          </div>
          <button type="button" onClick={onClose} style={P.modalClose}>×</button>
        </div>

        <div style={P.modalBody}>
          {error && (
            <div style={{ ...P.deleteWarn, marginBottom: 14 }}>
              <div style={P.deleteBody}>{error}</div>
            </div>
          )}

          {!verified ? (
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={P.fieldLabel}>Code from the hirer</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  style={{ ...P.fieldInput, letterSpacing: ".3em", textAlign: "center", fontSize: 20 }}
                  maxLength={6}
                />
              </div>
              <div style={P.helperText}>There is no chat on CRAL - if the hirer can't find their code, call CRAL support.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={P.fieldGrid}>
                <div>
                  <label style={P.fieldLabel}>Odometer (km)</label>
                  <input value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ""))} style={P.fieldInput} />
                </div>
                <div>
                  <label style={P.fieldLabel}>Fuel level</label>
                  <select value={fuel} onChange={(e) => setFuel(e.target.value as typeof fuel)} style={{ ...P.fieldInputText, fontFamily: "'Instrument Sans',sans-serif" }}>
                    <option value="">Not checked</option>
                    <option value="empty">Empty</option>
                    <option value="quarter">Quarter</option>
                    <option value="half">Half</option>
                    <option value="three_quarter">Three-quarter</option>
                    <option value="full">Full</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={P.fieldLabel}>Condition photos</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  style={{ display: "none" }}
                  id="handover-photo-input"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    files.forEach((file) => {
                      if (!handover) return;
                      uploadPhoto.mutate(
                        { handoverId: handover.id, file },
                        { onSuccess: (doc) => setPhotoIds((ids) => [...ids, doc.document_id]) },
                      );
                    });
                    e.target.value = "";
                  }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <label htmlFor="handover-photo-input" style={{ ...P.docRowBtn, borderColor: "#CDD2DA", color: "#0F23A8", background: "#fff", cursor: "pointer" }}>
                    {uploadPhoto.isPending ? "Uploading…" : "Add photos"}
                  </label>
                  <span style={P.helperText}>{photoIds.length > 0 ? `${photoIds.length} attached` : "None yet"}</span>
                </div>
                {photoIds.length === 0 && !skippedPhotos && canSkipPhotos && (
                  <div style={{ ...P.verifyNotice, marginTop: 10 }}>
                    Skipping means a damage claim can't be filed against this booking later - there will be no before-state to check against.
                  </div>
                )}
                {photoIds.length === 0 && canSkipPhotos && (
                  <button type="button" onClick={() => setSkippedPhotos(true)} style={{ ...P.tlViewAll, marginTop: 8, padding: 0 }}>
                    {skippedPhotos ? "Skipping without photos" : "Skip photos for now"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={P.modalFoot}>
          <button type="button" onClick={onClose} style={P.modalCancel}>Cancel</button>
          <button
            type="button"
            disabled={!verified ? verifyOtp.isPending || !code.trim() : finishing}
            onClick={!verified ? handleVerify : handleFinish}
            style={{ ...P.modalCta, background: "#0F23A8", opacity: (!verified ? verifyOtp.isPending || !code.trim() : finishing) ? 0.6 : 1 }}
          >
            {!verified ? (verifyOtp.isPending ? "Checking…" : "Verify code") : finishing ? "Finishing…" : kind === "pickup" ? "Confirm handover" : "Confirm returned"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Report an issue
// ---------------------------------------------------------------------

const REPORT_CATEGORIES: { value: BookingReportCategory; label: string }[] = [
  { value: "damage", label: "Damage" },
  { value: "fuel_short", label: "Fuel short" },
  { value: "late_return", label: "Late return" },
  { value: "missing_equipment", label: "Missing equipment" },
  { value: "cleaning", label: "Cleaning" },
  { value: "conduct", label: "Conduct" },
  { value: "other", label: "Other" },
];

function ReportModal({ b, onClose }: { b: BookingDetailData; onClose: () => void }): JSX.Element {
  const flash = useToast();
  const create = useCreateBookingReport(b.id);
  const [kind, setKind] = useState<BookingReportKind>("claim");
  const [category, setCategory] = useState<BookingReportCategory>("damage");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  // The merchant states the real cost. The API decides what is actually
  // recoverable and settles it - none of that reaches this screen.
  const amountNum = (parseInt(amount.replace(/\D/g, ""), 10) || 0) * 100;
  const photosBlocked = category === "damage" && !b.has_pickup_condition_photos;

  return (
    <Modal
      title="Report an issue"
      sub="CRAL reviews claims like this and settles what the hirer owes."
      onClose={onClose}
      ctaLabel={create.isPending ? "Filing…" : "File report"}
      ctaDisabled={create.isPending || !description.trim() || (kind === "claim" && !amount) || photosBlocked}
      onConfirm={() =>
        create.mutate(
          {
            kind,
            category,
            description: description.trim(),
            ...(kind === "claim" ? { amount: amountNum } : {}),
          },
          {
            onSuccess: () => {
              onClose();
              flash(kind === "claim" ? "Claim filed. CRAL is reviewing it." : "Reported. This is added to the hirer's record.");
            },
            onError: (err) => flash(err instanceof ApiClientError ? err.message : "Couldn't file that. Try again.", "#FF8A8A"),
          },
        )
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div style={P.toggleRow}>
          <div>
            <div style={P.toggleRowTitle}>Does this need money back from the hirer?</div>
            <div style={P.toggleRowSub}>
              {kind === "claim"
                ? "CRAL reviews the amount and recovers what it can."
                : "No money - this just goes on their record."}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setKind((k) => (k === "claim" ? "conduct" : "claim"))}
            style={{ ...P.toggleTrack, background: kind === "claim" ? "#0F23A8" : "#CDD2DA", justifyContent: kind === "claim" ? "flex-end" : "flex-start" }}
          >
            <span style={P.toggleThumb} />
          </button>
        </div>

        <div>
          <label style={P.fieldLabel}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as BookingReportCategory)} style={{ ...P.fieldInputText, fontFamily: "'Instrument Sans',sans-serif" }}>
            {REPORT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {kind === "claim" && (
          <div>
            <label style={P.fieldLabel}>Amount claimed (KES)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} style={P.fieldInput} placeholder="0" />
          </div>
        )}

        <div>
          <label style={P.fieldLabel}>What happened</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={P.textarea} />
        </div>

        {category === "damage" && !b.has_pickup_condition_photos && (
          <div style={P.deleteWarn}>
            <div style={P.deleteBody}>No pickup condition photos are on file for this booking, so a damage claim can't be filed.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Rate the hirer
// ---------------------------------------------------------------------

function RateModal({ b, onClose }: { b: BookingDetailData; onClose: () => void }): JSX.Element {
  const flash = useToast();
  const rate = useRateHirer(b.id);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");

  return (
    <Modal
      title="Rate this hirer"
      sub="The hirer sees this on their profile."
      onClose={onClose}
      ctaLabel={rate.isPending ? "Submitting…" : "Submit rating"}
      ctaDisabled={rate.isPending || stars === 0}
      onConfirm={() =>
        rate.mutate(
          { stars, ...(comment.trim() ? { comment: comment.trim() } : {}) },
          {
            onSuccess: () => {
              onClose();
              flash("Rating submitted.");
            },
            onError: (err) => flash(err instanceof ApiClientError ? err.message : "Couldn't submit. Try again.", "#FF8A8A"),
          },
        )
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={P.fieldLabel}>How did it go</label>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setStars(n)}
                style={{
                  width: 44,
                  height: 44,
                  border: "1.5px solid #CDD2DA",
                  borderRadius: "var(--r)",
                  background: n <= stars ? "#FFF3DB" : "#FFFFFF",
                  color: n <= stars ? "#C77400" : "#CDD2DA",
                  cursor: "pointer",
                  fontSize: 18,
                }}
              >
                ★
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={P.fieldLabel}>Comment · optional</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} style={P.textarea} placeholder="Brought it back on time, tank full, no new scratches." />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Hirer history drawer
// ---------------------------------------------------------------------

function HirerHistoryModal({ bookingId, onClose }: { bookingId: string; onClose: () => void }): JSX.Element {
  const { data, isPending } = useHirerHistory(bookingId);
  return (
    <div style={P.overlay} onClick={onClose}>
      <div style={{ ...P.modalBox, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div style={P.modalHead}>
          <div style={P.modalTitle}>Hirer history</div>
          <button type="button" onClick={onClose} style={P.modalClose}>×</button>
        </div>
        <div style={P.modalBody}>
          {isPending || !data ? (
            <div style={P.helperText}>Loading…</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ font: "600 17px/1.3 Archivo,sans-serif", color: "#0B0F1A" }}>{data.name}</div>
              <div style={P.priceBody}>
                {[
                  ["Member since", new Date(data.member_since).toLocaleDateString("en-GB", { month: "short", year: "numeric" })],
                  ["Trips on CRAL", String(data.trip_count)],
                  ["Completed", String(data.completed_count)],
                  ["Cancelled", String(data.cancellation_count)],
                  ["Average rating", data.average_rating ? `${data.average_rating.toFixed(1)} / 5` : "Not yet rated"],
                  ["Licence valid to", data.licence_valid_to ? fmtDate(data.licence_valid_to) : "Not on file"],
                ].map(([k, v]) => (
                  <div key={k} style={P.priceRow}>
                    <span style={P.priceKey}>{k}</span>
                    <span style={P.priceVal}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------

export function BookingDetail(): JSX.Element {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const flash = useToast();
  const { data: b, isPending } = useBookingDetail(bookingId);
  const { data: hirerHistory } = useHirerHistory(bookingId);
  usePageTitle(b ? `Booking ${b.ref}` : "Booking");
  const [modal, setModal] = useState<ModalKind>(null);
  const [handoverKind, setHandoverKind] = useState<"pickup" | "return">("pickup");

  if (isPending || !b) return <div />;

  const meta = BOOKING_STATUS[b.status];
  const days = durationDays(b.pickup_at, b.dropoff_at);
  const canReport = b.status === "active" || b.status === "completed";
  const canRate = b.status === "completed" && b.rating_open_until && new Date(b.rating_open_until).getTime() > Date.now() && !hasRated(b);

  return (
    <div>
      <button type="button" style={P.backLink} onClick={() => navigate("/bookings")}>← All bookings</button>

      <div style={P.mastCard}>
        <div style={P.mastTop}>
          <div>
            <div style={P.mastTagRow}>
              <span style={P.mastPlate}>{b.ref}</span>
              <span style={{ ...P.mastStatus, background: meta.tint, border: `1px solid ${meta.border}`, color: meta.text }}>
                <span style={{ ...P.mastStatusDot, background: meta.core }} />
                {meta.label}
              </span>
              {b.status === "requested" && b.response_due_at && (
                <span style={{ ...P.mastStatus, background: "#FFF3DB", border: "1px solid #F5D9A3", color: "#8A5200" }}>
                  {respondByLabel(b.response_due_at)}
                </span>
              )}
            </div>
            <h1 style={P.mastH1}>{b.hirer_name}</h1>
            <div style={P.mastSub}>{b.vehicle_registration} · {b.vehicle_make} {b.vehicle_model} · {fmtDate(b.pickup_at)} → {fmtDate(b.dropoff_at)} · {days} days</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={P.mastRefLabel}>REQUESTED</div>
            <div style={P.mastRef}>{fmtDateTime(b.requested_at)}</div>
          </div>
        </div>

        <div style={P.mastActions}>
          {b.status === "requested" && (
            <>
              <button type="button" style={{ ...P.addButton, height: 38, padding: "0 15px", font: "600 13px/1 'Instrument Sans',sans-serif" }} onClick={() => setModal("accept")}>
                Accept booking
              </button>
              <button type="button" style={P.actionBtn} onClick={() => flash("Booking sheets are coming soon.", "#8C97A8")}>Booking sheet</button>
              <button type="button" style={{ ...P.deleteBtn, marginLeft: 0 }} onClick={() => setModal("decline")}>Turn it down</button>
            </>
          )}
          {b.status === "confirmed" && (
            <>
              <button
                type="button"
                style={{ ...P.addButton, height: 38, padding: "0 15px", font: "600 13px/1 'Instrument Sans',sans-serif" }}
                onClick={() => {
                  setHandoverKind("pickup");
                  setModal("handover");
                }}
              >
                Start the hire
              </button>
              <button type="button" style={P.actionBtn} onClick={() => flash("Booking sheets are coming soon.", "#8C97A8")}>Booking sheet</button>
              <button type="button" style={{ ...P.deleteBtn, marginLeft: 0 }} onClick={() => setModal("cancel")}>Cancel booking</button>
            </>
          )}
          {b.status === "active" && (
            <>
              <button
                type="button"
                style={{ ...P.addButton, height: 38, padding: "0 15px", font: "600 13px/1 'Instrument Sans',sans-serif" }}
                onClick={() => {
                  setHandoverKind("return");
                  setModal("handover");
                }}
              >
                Mark returned
              </button>
              <button type="button" style={P.actionBtn} onClick={() => flash("Booking sheets are coming soon.", "#8C97A8")}>Booking sheet</button>
              {canReport && (
                <button type="button" style={P.actionBtn} onClick={() => setModal("report")}>Report an issue</button>
              )}
              <button type="button" style={{ ...P.deleteBtn, marginLeft: 0 }} onClick={() => setModal("cancel")}>Cancel booking</button>
            </>
          )}
          {b.status === "completed" && (
            <>
              {canRate && (
                <button type="button" style={{ ...P.addButton, height: 38, padding: "0 15px", font: "600 13px/1 'Instrument Sans',sans-serif" }} onClick={() => setModal("rate")}>
                  Rate the hirer
                </button>
              )}
              <button type="button" style={P.actionBtn} onClick={() => flash("Receipts are coming soon.", "#8C97A8")}>Download receipt</button>
              {canReport && (
                <button type="button" style={P.actionBtn} onClick={() => setModal("report")}>Report an issue</button>
              )}
            </>
          )}
          {(b.status === "cancelled" || b.status === "declined" || b.status === "expired") && (
            <button type="button" style={P.actionBtn} onClick={() => flash("Booking sheets are coming soon.", "#8C97A8")}>Booking sheet</button>
          )}
        </div>
      </div>

      <div style={P.detailBody}>
        <div style={P.detailMain}>
          <div style={P.card}>
            <div style={P.cardHead}>
              <span style={P.cardTitle}>Itinerary</span>
              <span style={{ font: "400 12px/1.3 'Instrument Sans',sans-serif", color: "#838C9B" }}>{days} DAYS</span>
            </div>
            <div style={{ ...P.specGrid, gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <div style={{ ...P.specKey, color: "#0F23A8" }}>● PICK-UP</div>
                <div style={{ font: "700 18px/1.3 Archivo,sans-serif", color: "#0B0F1A" }}>
                  {fmtDateWithDay(b.pickup_at)} · {fmtTime(b.pickup_at)}
                </div>
                <div style={{ ...P.rowMeta, marginTop: 4 }}>{b.pickup_location}</div>
              </div>
              <div>
                <div style={{ ...P.specKey, color: "#0B8A5B" }}>● DROP-OFF</div>
                <div style={{ font: "700 18px/1.3 Archivo,sans-serif", color: "#0B0F1A" }}>
                  {fmtDateWithDay(b.dropoff_at)} · {fmtTime(b.dropoff_at)}
                </div>
                <div style={{ ...P.rowMeta, marginTop: 4 }}>{b.dropoff_location}</div>
              </div>
            </div>
            {b.note_from_hirer && (
              <div style={{ padding: "0 18px 18px" }}>
                <div style={P.specKey}>NOTE FROM THE HIRER</div>
                <div style={{ font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#333B4A" }}>{b.note_from_hirer}</div>
              </div>
            )}
            {(b.status === "active" || b.status === "completed") && !b.has_pickup_condition_photos && (
              <div style={{ padding: "0 18px 18px" }}>
                <div style={{ ...P.helperText, color: "#8A5200" }}>No condition photos on file from pick-up - a damage claim can't be filed on this booking.</div>
              </div>
            )}
          </div>

          <div style={P.card}>
            <div style={P.cardHead}>
              <span style={P.cardTitle}>The hirer</span>
              <span style={{ font: "400 12px/1.3 'Instrument Sans',sans-serif", color: "#838C9B" }}>Checked by CRAL before booking</span>
            </div>
            <div style={{ padding: 18, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={P.payoutAvatar}>{b.hirer_name.slice(0, 2).toUpperCase()}</span>
              <div>
                <div style={{ font: "600 15px/1.3 Archivo,sans-serif", color: "#0B0F1A" }}>{b.hirer_name}</div>
                <div style={P.rowMeta}>
                  {b.hirer_is_corporate ? "Corporate account" : "Individual"}
                  {hirerHistory &&
                    ` · ${hirerHistory.trip_count} trip${hirerHistory.trip_count === 1 ? "" : "s"} on CRAL${
                      hirerHistory.average_rating ? ` · ${hirerHistory.average_rating.toFixed(1)}★` : ""
                    }`}
                </div>
              </div>
            </div>
            <div style={{ ...P.specGrid, gridTemplateColumns: "repeat(3,1fr)", paddingTop: 0 }}>
              <div>
                <div style={P.specKey}>DRIVING LICENCE</div>
                <div style={{ ...P.specVal, fontSize: 13 }}>
                  {hirerHistory?.licence_valid_to ? `Valid to ${fmtDate(hirerHistory.licence_valid_to)}` : "Not on file"}
                </div>
              </div>
              <div>
                <div style={P.specKey}>ON CRAL</div>
                <div style={{ ...P.specVal, fontSize: 13 }}>{hirerHistory ? `Since ${fmtDate(hirerHistory.member_since)}` : " - "}</div>
              </div>
              <div>
                <div style={P.specKey}>COMPLETED</div>
                <div style={{ ...P.specVal, fontSize: 13 }}>{hirerHistory ? `${hirerHistory.completed_count} bookings` : " - "}</div>
              </div>
            </div>
            <div style={{ padding: "0 18px 18px", ...P.helperText }}>
              There is no chat on CRAL, and hirer phone numbers stay private. If you need to reach this hirer, call CRAL and we will pass the message on.
            </div>
            <div style={{ padding: "0 18px 18px" }}>
              <button type="button" style={{ ...P.priceEditBtn }} onClick={() => setModal("hirer-history")}>View full history</button>
            </div>
          </div>
        </div>

        <div style={P.detailSide}>
          <div style={P.card}>
            <div style={P.cardHead}>
              <span style={P.cardTitle}>Vehicle</span>
            </div>
            <div style={{ padding: 18, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={P.plateBadge}>{b.vehicle_registration}</span>
              <div>
                <div style={{ font: "600 15px/1.3 Archivo,sans-serif", color: "#0B0F1A" }}>{b.vehicle_make} {b.vehicle_model}</div>
                <div style={P.rowMeta}>
                  {b.vehicle_type} · {b.vehicle_year} · {b.vehicle_chauffeured ? "With driver" : "Self-drive"}
                  {b.vehicle_pickup_address ? ` · ${b.vehicle_pickup_address}` : ""}
                </div>
              </div>
            </div>
            <div style={{ padding: "0 18px 18px", ...P.helperText }}>
              {b.vehicle_chauffeured
                ? "Driver included - you or your named driver must be available for the whole hire."
                : "Self-drive. The hirer drives; their licence is on file above."}
            </div>
          </div>

          <div style={P.sideCard}>
            <div style={P.sideCardLabel}>WHAT THIS BOOKING PAYS</div>
            <div style={P.breakdown}>
              <div style={P.breakdownRow}>
                <span style={P.breakdownKey}>Booking value</span>
                <span style={P.breakdownVal}>KES {money(b.gross.amount)}</span>
              </div>
              <div style={{ ...P.breakdownRow, ...P.breakdownRowTop }}>
                <span style={P.breakdownKey}>CRAL commission</span>
                <span style={{ ...P.breakdownVal, color: "#A50E22" }}>− KES {money(b.commission.amount)}</span>
              </div>
              {b.cancellation_fee && (
                <div style={{ ...P.breakdownRow, ...P.breakdownRowTop }}>
                  <span style={P.breakdownKey}>Late cancellation fee</span>
                  <span style={P.breakdownVal}>KES {money(b.cancellation_fee.amount)}</span>
                </div>
              )}
              {b.refund && (
                <div style={{ ...P.breakdownRow, ...P.breakdownRowTop }}>
                  <span style={P.breakdownKey}>Refunded to the hirer</span>
                  <span style={P.breakdownVal}>KES {money(b.refund.amount)}</span>
                </div>
              )}
              <div style={P.breakdownNet}>
                <span style={P.breakdownNetKey}>You keep</span>
                <span style={P.breakdownNetVal}><span style={P.breakdownNetPrefix}>KES</span> {money(b.merchant_net.amount)}</span>
              </div>
            </div>
          </div>

          <div style={P.payoutCard}>
            <div style={P.payoutLabel}>PAYOUT DESTINATION</div>
            <div style={P.payoutRow}>
              <span style={P.payoutAvatar}>M</span>
              <div>
                <div style={P.payoutName}>M-Pesa · {b.payout_detail}</div>
                <div style={P.payoutSub}>{b.payout_account_name}</div>
              </div>
            </div>
          </div>

          <div style={P.sideCard}>
            <div style={P.sideCardLabel}>BOOKING HISTORY</div>
            {b.events.map((e, i) => (
              <div key={i} style={P.tlRow}>
                <div style={P.tlRail}>
                  <span style={{ ...P.tlDot, background: TONE[e.tone] }} />
                  {i < b.events.length - 1 && <span style={P.tlLine} />}
                </div>
                <div style={P.tlBody}>
                  <div style={{ ...P.tlLabel, color: e.tone === "grey" ? "#333B4A" : "#0B0F1A" }}>{e.label}</div>
                  {e.body && <div style={P.tlText}>{e.body}</div>}
                  <div style={P.tlWhen}>{fmtDateTime(e.occurred_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modal === "accept" && <AcceptModal b={b} onClose={() => setModal(null)} />}
      {modal === "decline" && <DeclineModal b={b} onClose={() => setModal(null)} />}
      {modal === "cancel" && <CancelModal b={b} onClose={() => setModal(null)} />}
      {modal === "handover" && <HandoverModal b={b} kind={handoverKind} onClose={() => setModal(null)} />}
      {modal === "report" && <ReportModal b={b} onClose={() => setModal(null)} />}
      {modal === "rate" && <RateModal b={b} onClose={() => setModal(null)} />}
      {modal === "hirer-history" && bookingId && <HirerHistoryModal bookingId={bookingId} onClose={() => setModal(null)} />}
    </div>
  );
}

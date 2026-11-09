import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { O } from "../components/onboarding/styles.js";
import { DOC_STATE, SALE_STATUS } from "../components/portal/status.js";
import { Modal } from "../components/portal/Modal.js";
import { useToast } from "../components/portal/Toast.js";
import { Toggle } from "../components/onboarding/primitives.js";
import { SaleListingFields, saleFormMissing } from "../components/sale/SaleListingFields.js";
import {
  PHOTO_LABELS,
  PHOTO_SLOTS,
  SALE_DOC_LABELS,
  fromListing,
  kesLine,
  toBody,
  useCloseEnquiry,
  useDeleteSaleListing,
  useReplyEnquiry,
  useSaleAction,
  useSaleInbox,
  useSaleListing,
  useUpdateSaleListing,
  useUploadSaleDocument,
  type PhotoSlot,
  type SaleDocKind,
  type SaleDocSlot,
  type SaleListing,
  type SaleListingInput,
  type SellerEnquiry,
} from "../lib/sales-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

const FREELY_EDITABLE = ["draft", "action", "rejected"];
const RE_REVIEW = ["live", "paused"];
const CLOSED = ["sold", "withdrawn", "expired", "removed"];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function UploadRow({
  label,
  helper,
  doc,
  required,
  canUpload,
  uploading,
  accept,
  onUpload,
}: {
  label: string;
  helper: string;
  doc: SaleDocSlot | null;
  required: boolean;
  canUpload: boolean;
  uploading: boolean;
  accept: string;
  onUpload: (file: File) => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const state = doc?.review_state ?? "missing";
  const d = DOC_STATE[state];
  const sub = state === "rejected" ? (doc?.review_note ? `Asked for again: ${doc.review_note}` : "Asked for again") : doc ? doc.original_name : helper;
  return (
    <div style={P.docRow}>
      <span style={{ ...P.docRowDot, background: d.core }} />
      <div style={{ flex: 1, minWidth: "min(100%,170px)" }}>
        <div style={P.docRowTitle}>
          {label}
          {!required && <span style={{ color: "#838C9B", fontWeight: 400 }}> · optional</span>}
        </div>
        <div style={{ ...P.docRowSub, color: state === "rejected" ? "#A50E22" : "#838C9B" }}>{sub}</div>
      </div>
      <span style={{ ...P.docRowState, color: d.fg }}>{doc || required ? d.label : ""}</span>
      {canUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
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

function EnquiryRow({ e, onReply, onClose }: { e: SellerEnquiry; onReply: () => void; onClose: () => void }): JSX.Element {
  return (
    <div style={{ ...P.docRow, alignItems: "flex-start" }}>
      <span style={{ ...P.docRowDot, marginTop: 6, background: e.status === "new" ? "#0F23A8" : "#CDD2DA" }} />
      <div style={{ flex: 1, minWidth: "min(100%,220px)" }}>
        <div style={P.docRowTitle}>
          {e.buyer_name}
          <span style={{ color: "#838C9B", fontWeight: 400 }}> · {fmtDate(e.created_at)}</span>
          {e.status === "new" && <span style={{ ...P.verifiedTag, marginLeft: 8, color: "#0F23A8", background: "#EDEFFC", borderColor: "#C3CBF5" }}>NEW</span>}
        </div>
        <div style={{ ...P.docRowSub, color: "#333B4A", whiteSpace: "pre-wrap" }}>{e.message}</div>
        {e.viewing_window && <div style={P.docRowSub}>Viewing: {e.viewing_window}</div>}
        {e.reply && <div style={{ ...P.docRowSub, color: "#076945" }}>You replied: {e.reply}</div>}
        {e.contact_shared && <div style={{ ...P.docRowSub, color: "#076945" }}>Your number was shared.</div>}
      </div>
      {e.status !== "closed" && (
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={P.docRowBtn} onClick={onReply}>Reply</button>
          <button type="button" style={{ ...P.docRowBtn, color: "#5A6373" }} onClick={onClose}>Close</button>
        </div>
      )}
    </div>
  );
}

/**
 * One car for sale (docs/plans/car-sales.md): its status and what to do
 * next, the logbook and eight photos, the buyers who asked, and the moves
 * a seller makes - pause, under offer, sold, withdraw, renew.
 */
export function SaleDetail(): JSX.Element {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const flash = useToast();
  const { data: l, isPending, error } = useSaleListing(listingId);
  const { data: inbox } = useSaleInbox(listingId);
  usePageTitle(l ? l.title : "For sale");

  const update = useUpdateSaleListing(listingId ?? "");
  const upload = useUploadSaleDocument(listingId ?? "");
  const action = useSaleAction(listingId ?? "");
  const remove = useDeleteSaleListing(listingId ?? "");
  const reply = useReplyEnquiry();
  const closeEnquiry = useCloseEnquiry();

  const [modal, setModal] = useState<null | "edit" | "delete" | "sold" | "withdraw" | "reply">(null);
  const [form, setForm] = useState<SaleListingInput | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<SellerEnquiry | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sharePhone, setSharePhone] = useState(true);
  const [soldViaCral, setSoldViaCral] = useState<boolean | null>(null);

  if (isPending) return <div style={{ color: "#838C9B" }}>Loading…</div>;
  if (error || !l) {
    return (
      <div>
        <button type="button" style={P.backLink} onClick={() => navigate("/sales")}>← All listings</button>
        <p style={P.lede}>That listing isn't on your account.</p>
      </div>
    );
  }

  const meta = SALE_STATUS[l.status];
  const carLocked = !FREELY_EDITABLE.includes(l.status) && !RE_REVIEW.includes(l.status);
  const canUpload = FREELY_EDITABLE.includes(l.status) || RE_REVIEW.includes(l.status);
  const closed = CLOSED.includes(l.status);
  const fail = (err: unknown) => flash(err instanceof Error ? err.message : "Something went wrong. Try again.", "#FF8A8A");
  const run = (a: Parameters<typeof action.mutate>[0], ok: string) =>
    action.mutate(a, { onSuccess: () => { setModal(null); flash(ok, "#57D69E"); }, onError: fail });

  function doUpload(key: string, input: { kind: SaleDocKind | "sale_photo"; slot?: PhotoSlot; file: File }, label: string) {
    if (RE_REVIEW.includes(l!.status) && !window.confirm("Changing a photo or paper takes the advert down until a reviewer has read it again. Go ahead?")) return;
    setUploading(key);
    upload.mutate(input, {
      onSuccess: () => flash(`${label} uploaded.`, "#6FC8F0"),
      onError: fail,
      onSettled: () => setUploading(null),
    });
  }

  function saveEdit() {
    if (!form) return;
    if (saleFormMissing(form)) {
      setShowErrors(true);
      return;
    }
    const full = toBody(form);
    const body = carLocked
      ? {
          asking_price: full.asking_price,
          negotiable: full.negotiable,
          county: full.county,
          viewing_area: full.viewing_area,
          description: full.description,
          auto_share_contact: full.auto_share_contact,
        }
      : full;
    update.mutate(body, {
      onSuccess: (saved: SaleListing) => {
        setModal(null);
        flash(saved.status === "pending" && RE_REVIEW.includes(l!.status) ? "Saved - back with a reviewer before it is listed again." : "Saved.", "#57D69E");
      },
      onError: fail,
    });
  }

  const photoCount = PHOTO_SLOTS.filter((s) => l.documents.photos[s]).length;

  return (
    <div>
      <button type="button" style={P.backLink} onClick={() => navigate("/sales")}>← All listings</button>

      <div style={P.mastCard}>
        <div style={P.mastTop}>
          <div>
            <div style={P.mastTagRow}>
              <span style={{ ...P.mastStatus, background: meta.tint, border: `1px solid ${meta.border}`, color: meta.text }}>
                <span style={{ ...P.mastStatusDot, background: meta.core }} />
                {meta.label}
              </span>
            </div>
            <h1 style={P.mastH1}>{l.title}</h1>
            <div style={P.mastSub}>
              {kesLine(l.asking_price)}
              {l.negotiable ? " · negotiable" : ""} · {l.car.mileage_km.toLocaleString("en-KE")} km · {l.viewing_area}, {l.county}
            </div>
            {l.status === "live" && l.expires_at && (
              <div style={{ ...P.mastSub, marginTop: 4 }}>
                Listed until {fmtDate(l.expires_at)} · {l.view_count} {l.view_count === 1 ? "view" : "views"}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={P.mastRefLabel}>{l.ref ? "SALE REF" : "PLATE"}</div>
            <div style={P.mastRef}>{l.ref ?? l.car.registration}</div>
          </div>
        </div>
        <div style={P.mastActions}>
          {FREELY_EDITABLE.includes(l.status) && (
            <button
              type="button"
              style={{ ...P.actionBtn, background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" }}
              disabled={action.isPending || l.missing_for_submit.length > 0}
              title={l.missing_for_submit.length ? `Still to add: ${l.missing_for_submit.join(", ")}` : undefined}
              onClick={() => run({ kind: "submit" }, "Sent for review.")}
            >
              {l.status === "draft" ? "Send for review" : "Send back for review"}
            </button>
          )}
          {!closed && (
            <button
              type="button"
              style={P.actionBtn}
              onClick={() => {
                setForm(fromListing(l));
                setShowErrors(false);
                setModal("edit");
              }}
            >
              {carLocked ? "Edit price & viewing" : "Edit details"}
            </button>
          )}
          {l.status === "live" && (
            <>
              <button type="button" style={P.actionBtn} onClick={() => run({ kind: "status", to: "under_offer" }, "Marked under offer.")}>
                Mark under offer
              </button>
              <button type="button" style={P.actionBtn} onClick={() => run({ kind: "status", to: "paused" }, "Paused - hidden from buyers.")}>
                Pause
              </button>
            </>
          )}
          {(l.status === "paused" || l.status === "under_offer") && (
            <button type="button" style={P.actionBtn} onClick={() => run({ kind: "status", to: "live" }, "Back on sale.")}>
              Put back on sale
            </button>
          )}
          {["live", "paused", "under_offer"].includes(l.status) && (
            <button type="button" style={P.actionBtn} onClick={() => setModal("sold")}>Mark sold</button>
          )}
          {(l.status === "expired" || (l.status === "live" && l.expires_at && new Date(l.expires_at).getTime() - Date.now() < 7 * 86_400_000)) && (
            <button type="button" style={{ ...P.actionBtn, background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" }} onClick={() => run({ kind: "renew" }, "Renewed for 60 days.")}>
              Renew for 60 days
            </button>
          )}
          {l.status === "draft" ? (
            <button type="button" style={P.deleteBtn} onClick={() => setModal("delete")}>Delete draft</button>
          ) : (
            !closed && <button type="button" style={P.deleteBtn} onClick={() => setModal("withdraw")}>Withdraw</button>
          )}
        </div>
      </div>

      {!l.seller_cleared && l.seller_gate_reason && !closed && (
        <div style={{ ...P.card, marginTop: 16, padding: "12px 16px", borderColor: "#F5D9A3", background: "#FFF3DB", color: "#8A5200", font: "600 13px/1.4 'Instrument Sans',sans-serif", maxWidth: 860 }}>
          {l.seller_gate_reason} The reviewer can't list the car until then.
        </div>
      )}

      {l.reviewer_note && ["action", "rejected", "removed"].includes(l.status) && (
        <div style={{ ...P.noteCard, marginTop: 16 }}>
          <div style={{ ...P.noteBar, background: meta.core }} />
          <div style={P.noteBody}>
            <div style={P.noteKickerRow}>
              <span style={{ ...P.noteRule, background: "#D81E32" }} />
              <span style={P.noteKicker}>NOTE FROM THE REVIEWER</span>
            </div>
            <p style={P.noteText}>{l.reviewer_note}</p>
          </div>
        </div>
      )}

      <div style={{ ...P.card, marginTop: 16, maxWidth: 860 }}>
        <div style={P.cardHead}>
          <span style={P.cardTitle}>Buyer enquiries</span>
          <span style={P.cardHeadTag}>{l.enquiries.total} TOTAL</span>
        </div>
        {!inbox || inbox.data.length === 0 ? (
          <div style={{ ...P.cardFoot, borderTop: "none" }}>
            {l.status === "live" ? "No enquiries yet. You are notified the moment a buyer asks." : "Enquiries appear here once the car is listed."}
          </div>
        ) : (
          inbox.data.map((e) => (
            <EnquiryRow
              key={e.id}
              e={e}
              onReply={() => {
                setReplyTo(e);
                setReplyText("");
                setSharePhone(true);
                setModal("reply");
              }}
              onClose={() => closeEnquiry.mutate(e.id, { onSuccess: () => flash("Enquiry closed.", "#8C97A8"), onError: fail })}
            />
          ))
        )}
      </div>

      <div style={{ ...P.card, marginTop: 16, maxWidth: 860 }}>
        <div style={P.cardHead}>
          <span style={P.cardTitle}>Papers</span>
          <span style={{ ...P.cardHeadTag, color: l.documents.logbook ? "#5A6373" : "#8A5200" }}>{l.documents.logbook ? "LOGBOOK IN" : "LOGBOOK NEEDED"}</span>
        </div>
        {(["logbook", "bank_clearance_letter", "ntsa_search"] as SaleDocKind[]).map((kind) => (
          <UploadRow
            key={kind}
            label={SALE_DOC_LABELS[kind]}
            helper={
              kind === "logbook"
                ? "The page with the owner's name and the chassis number."
                : kind === "bank_clearance_letter"
                  ? l.disclosures.encumbered ? "Recommended - a bank is on the logbook." : "Only if a bank was on the logbook."
                  : "An eCitizen search record. Shown to buyers as a checked paper."
            }
            doc={l.documents[kind]}
            required={kind === "logbook"}
            canUpload={canUpload}
            uploading={uploading === kind}
            accept="application/pdf,image/jpeg,image/png"
            onUpload={(file) => doUpload(kind, { kind, file }, SALE_DOC_LABELS[kind])}
          />
        ))}
      </div>

      <div style={{ ...P.card, marginTop: 16, maxWidth: 860 }}>
        <div style={P.cardHead}>
          <span style={P.cardTitle}>The eight photos</span>
          <span style={{ ...P.cardHeadTag, color: photoCount === 8 ? "#5A6373" : "#8A5200" }}>{photoCount} OF 8</span>
        </div>
        {PHOTO_SLOTS.map((slot) => (
          <UploadRow
            key={slot}
            label={PHOTO_LABELS[slot]}
            helper="Not uploaded yet"
            doc={l.documents.photos[slot]}
            required
            canUpload={canUpload}
            uploading={uploading === slot}
            accept="image/jpeg,image/png,image/webp"
            onUpload={(file) => doUpload(slot, { kind: "sale_photo", slot, file }, PHOTO_LABELS[slot])}
          />
        ))}
        <div style={P.cardFoot}>Daylight, the whole car in frame. The reviewer checks the plate and chassis plate against the logbook.</div>
      </div>

      {modal === "edit" && form && (
        <Modal
          title={carLocked ? "Price and viewing" : "Listing details"}
          {...(carLocked ? { sub: "A reviewer has the car's details - those stay as submitted." } : RE_REVIEW.includes(l.status) ? { sub: "Changing the car's details takes the advert down until a reviewer reads them again. Price and viewing changes stay live." } : {})}
          width={820}
          onClose={() => setModal(null)}
          onConfirm={saveEdit}
          ctaLabel={update.isPending ? "Saving…" : "Save"}
          ctaDisabled={update.isPending}
        >
          <SaleListingFields value={form} onChange={setForm} showErrors={showErrors} carLocked={carLocked} plateLocked={!!l.vehicle_id} />
          {showErrors && <div style={{ ...O.fieldError, marginTop: 10 }}>Check the highlighted fields.</div>}
        </Modal>
      )}

      {modal === "sold" && (
        <Modal
          title="Mark this car sold?"
          sub={l.vehicle_id ? "It comes off sale, and off hire for good. Any open hire request has to be finished or cancelled first." : "It comes off sale. This can't be undone."}
          onClose={() => setModal(null)}
          onConfirm={() => run({ kind: "status", to: "sold", ...(soldViaCral !== null ? { sold_via_cral: soldViaCral } : {}) }, "Marked sold. Congratulations.")}
          ctaLabel={action.isPending ? "Saving…" : "Mark sold"}
          ctaDisabled={action.isPending}
        >
          <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A", marginBottom: 10 }}>Did the buyer find it on CRAL?</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ v: true, l: "Yes" }, { v: false, l: "No" }].map((o) => (
              <button
                key={o.l}
                type="button"
                style={{ ...P.actionBtn, ...(soldViaCral === o.v ? { background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" } : {}) }}
                onClick={() => setSoldViaCral(o.v)}
              >
                {o.l}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {modal === "withdraw" && (
        <Modal
          title="Withdraw this listing?"
          sub="Buyers can no longer see it. You can list the car again later as a new listing."
          onClose={() => setModal(null)}
          onConfirm={() => run({ kind: "status", to: "withdrawn" }, "Withdrawn.")}
          ctaLabel={action.isPending ? "Withdrawing…" : "Withdraw"}
          ctaBg="#D81E32"
          ctaDisabled={action.isPending}
        >
          <p style={{ ...P.lede, margin: 0 }}>Open enquiries stay in your inbox.</p>
        </Modal>
      )}

      {modal === "delete" && (
        <Modal
          title="Delete this draft?"
          sub="Its photos and papers are deleted too."
          onClose={() => setModal(null)}
          onConfirm={() =>
            remove.mutate(undefined, {
              onSuccess: () => {
                flash("Draft deleted.", "#8C97A8");
                navigate("/sales");
              },
              onError: fail,
            })
          }
          ctaLabel={remove.isPending ? "Deleting…" : "Delete draft"}
          ctaBg="#D81E32"
          ctaDisabled={remove.isPending}
        >
          <p style={{ ...P.lede, margin: 0 }}>This can't be undone.</p>
        </Modal>
      )}

      {modal === "reply" && replyTo && (
        <Modal
          title={`Reply to ${replyTo.buyer_name}`}
          sub="They are told by email and in their CRAL account."
          width={620}
          onClose={() => setModal(null)}
          onConfirm={() =>
            reply.mutate(
              { id: replyTo.id, ...(replyText.trim() ? { message: replyText.trim() } : {}), share_phone: sharePhone },
              { onSuccess: () => { setModal(null); flash("Reply sent.", "#57D69E"); }, onError: fail },
            )
          }
          ctaLabel={reply.isPending ? "Sending…" : "Send reply"}
          ctaDisabled={reply.isPending || (!sharePhone && !replyText.trim())}
        >
          <p style={{ ...P.docRowSub, margin: "0 0 10px", color: "#333B4A", whiteSpace: "pre-wrap" }}>"{replyTo.message}"</p>
          <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} style={P.textarea} placeholder="Yes, it's available. Saturday morning works." />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <Toggle on={sharePhone} onToggle={() => setSharePhone(!sharePhone)} />
            <div>
              <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>Share my phone number</div>
              <div style={O.helper}>The buyer is also reminded never to pay before seeing the car and logbook.</div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

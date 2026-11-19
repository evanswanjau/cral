import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import { P } from "../components/portal/styles.js";
import { O } from "../components/onboarding/styles.js";
import { STATUS } from "../components/portal/status.js";
import { Modal } from "../components/portal/Modal.js";
import { useToast } from "../components/portal/Toast.js";
import { OutletFields, outletFormMissing, type OutletFormValue } from "../components/outlet/OutletFields.js";
import {
  DETAIL_EDITABLE,
  MAX_PHOTOS,
  MIN_PHOTOS,
  SERVICE_LABELS,
  outletPhotoBlob,
  useDeleteOutlet,
  useDeleteOutletPhoto,
  useOutlet,
  useOutletAction,
  useUpdateOutlet,
  useUploadOutletPhoto,
  type Outlet,
} from "../lib/outlets-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * One set of premises (Phase 4 GS1). Not from a canvas; built from
 * tokens.ts and the portal's detail idiom (DriverDetail). "Visited" shows
 * only when CRAL recorded a visit; there is no other source for it.
 */

const SUBMITTABLE = ["draft", "action", "rejected"];

function toForm(o: Outlet): OutletFormValue {
  return {
    name: o.name,
    address: o.address,
    county: o.county,
    phone: o.phone ?? "",
    opening_hours: o.opening_hours,
    service_types: o.service_types,
  };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** The photo bytes come through the API (bearer auth), so each is a blob URL. */
function Thumb({ outletId, photoId, alt }: { outletId: string; photoId: string; alt: string }): JSX.Element {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    outletPhotoBlob(outletId, photoId)
      .then((blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [outletId, photoId]);
  const box = { width: "100%", aspectRatio: "4 / 3", borderRadius: 8, background: "#F1F3F6", objectFit: "cover" as const, display: "block" };
  if (src) return <img src={src} alt={alt} style={box} />;
  return (
    <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" }}>
      {failed ? "Couldn't load" : "Loading…"}
    </div>
  );
}

function Photos({ o, canRemove, flash }: { o: Outlet; canRemove: boolean; flash: (msg: string, color: string) => void }): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadOutletPhoto(o.id);
  const remove = useDeleteOutletPhoto(o.id);
  const fail = (err: unknown) => flash(err instanceof Error ? err.message : "Something went wrong. Try again.", "#FF8A8A");
  const full = o.photos.length >= MAX_PHOTOS;

  return (
    <div style={{ ...P.card, marginTop: 16, maxWidth: 820 }}>
      <div style={P.cardHead}>
        <span style={P.cardTitle}>Photos</span>
        <span style={{ ...P.cardHeadTag, color: o.photos.length >= MIN_PHOTOS ? "#5A6373" : "#8A5200" }}>
          {o.photos.length} OF {MAX_PHOTOS}
        </span>
      </div>
      <div style={{ padding: 18 }}>
        {o.photos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginBottom: 14 }}>
            {o.photos.map((p) => (
              <div key={p.id} style={{ position: "relative" }}>
                <Thumb outletId={o.id} photoId={p.id} alt={`${o.name}: ${p.original_name}`} />
                {canRemove && (
                  <button
                    type="button"
                    aria-label={`Remove ${p.original_name}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(p.id, { onSuccess: () => flash("Photo removed.", "#8C97A8"), onError: fail })}
                    style={{ position: "absolute", top: 6, right: 6, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF", border: "1px solid #CDD2DA", borderRadius: 8, cursor: "pointer" }}
                  >
                    <Trash size={18} color="#A50E22" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file, { onSuccess: () => flash("Photo added.", "#6FC8F0"), onError: fail });
            e.target.value = "";
          }}
        />
        <button
          type="button"
          style={{ ...P.actionBtn, minHeight: 44, color: "#0F23A8" }}
          disabled={upload.isPending || full}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? "Uploading…" : full ? `${MAX_PHOTOS} photos is the most` : "Add a photo"}
        </button>
      </div>
      <div style={P.cardFoot}>
        At least {MIN_PHOTOS}: the front with your sign, and where the work is done. Photos from your phone are fine. The
        visit checks they are of these premises.
      </div>
    </div>
  );
}

export function PremisesDetail(): JSX.Element {
  const { outletId } = useParams();
  const navigate = useNavigate();
  const flash = useToast();
  const { data: o, isPending, error } = useOutlet(outletId);
  usePageTitle(o ? o.name : "Premises");

  const update = useUpdateOutlet(outletId ?? "");
  const submit = useOutletAction(outletId ?? "", "submit");
  const pause = useOutletAction(outletId ?? "", "pause");
  const resume = useOutletAction(outletId ?? "", "resume");
  const remove = useDeleteOutlet(outletId ?? "");

  const [modal, setModal] = useState<null | "edit" | "delete">(null);
  const [form, setForm] = useState<OutletFormValue | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  if (isPending) return <div style={{ color: "#838C9B" }}>Loading…</div>;
  if (error || !o) {
    return (
      <div>
        <button type="button" style={P.backLink} onClick={() => navigate("/premises")}>← All premises</button>
        <p style={P.lede}>Those premises aren't on your account.</p>
      </div>
    );
  }

  const meta = STATUS[o.status];
  const detailsLocked = !DETAIL_EDITABLE.includes(o.status);
  const isLive = o.status === "live" || o.status === "paused";
  const fail = (err: unknown) => flash(err instanceof Error ? err.message : "Something went wrong. Try again.", "#FF8A8A");

  function openEdit() {
    setForm(toForm(o!));
    setShowErrors(false);
    setModal("edit");
  }

  function saveEdit() {
    if (!form) return;
    if (outletFormMissing(form)) {
      setShowErrors(true);
      return;
    }
    // While CRAL has the premises, only hours, phone and services go up.
    const body = detailsLocked
      ? { phone: form.phone, opening_hours: form.opening_hours, service_types: form.service_types }
      : form;
    update.mutate(body, {
      onSuccess: () => {
        setModal(null);
        flash("Premises saved.", "#57D69E");
      },
      onError: fail,
    });
  }

  return (
    <div>
      <button type="button" style={P.backLink} onClick={() => navigate("/premises")}>← All premises</button>

      <div style={P.mastCard}>
        <div style={P.mastTop}>
          <div>
            <div style={P.mastTagRow}>
              <span style={{ ...P.mastStatus, background: meta.tint, border: `1px solid ${meta.border}`, color: meta.text }}>
                <span style={{ ...P.mastStatusDot, background: meta.core }} />
                {meta.label}
              </span>
            </div>
            <h1 style={P.mastH1}>{o.name}</h1>
            <div style={P.mastSub}>{o.address} · {o.county}</div>
            <div style={P.mastSub}>{o.opening_hours}{o.phone ? ` · ${o.phone}` : ""}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={P.mastRefLabel}>CRAL VISIT</div>
            <div style={P.mastRef}>{o.visited && o.visited_on ? fmtDate(o.visited_on) : "Not yet"}</div>
          </div>
        </div>
        <div style={P.mastActions}>
          {SUBMITTABLE.includes(o.status) && (
            <button
              type="button"
              style={{ ...P.actionBtn, minHeight: 44, background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" }}
              disabled={submit.isPending}
              onClick={() => submit.mutate(undefined, { onSuccess: () => flash("Sent. We'll be in touch to arrange the visit.", "#57D69E"), onError: fail })}
            >
              {submit.isPending ? "Sending…" : o.status === "draft" ? "Send for a visit" : "Send again"}
            </button>
          )}
          <button type="button" style={{ ...P.actionBtn, minHeight: 44 }} onClick={openEdit}>
            {detailsLocked ? "Edit hours and services" : "Edit details"}
          </button>
          {isLive && (
            <button
              type="button"
              style={{ ...P.actionBtn, minHeight: 44 }}
              onClick={() =>
                (o.status === "live" ? pause : resume).mutate(undefined, {
                  onSuccess: () => flash(o.status === "live" ? "Paused. No new requests." : "Taking requests again.", "#8C97A8"),
                  onError: fail,
                })
              }
            >
              {o.status === "live" ? "Pause requests" : "Take requests again"}
            </button>
          )}
          {!isLive && (
            <button type="button" style={{ ...P.deleteBtn, minHeight: 44 }} onClick={() => setModal("delete")}>Remove premises</button>
          )}
        </div>
      </div>

      {o.reviewer_note && (o.status === "action" || o.status === "rejected") && (
        <div style={{ ...P.noteCard, marginTop: 16 }}>
          <div style={{ ...P.noteBar, background: meta.core }} />
          <div style={P.noteBody}>
            <div style={P.noteKickerRow}>
              <span style={{ ...P.noteRule, background: "#D81E32" }} />
              <span style={P.noteKicker}>NOTE FROM THE REVIEWER</span>
            </div>
            <p style={P.noteText}>{o.reviewer_note}</p>
          </div>
        </div>
      )}

      <div style={{ ...P.card, marginTop: 16, maxWidth: 820 }}>
        <div style={P.cardHead}>
          <span style={P.cardTitle}>Services</span>
        </div>
        <div style={{ padding: 18, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {o.service_types.length === 0 ? (
            <span style={{ ...P.lede, margin: 0 }}>None ticked yet. Edit details to add the services you do here.</span>
          ) : (
            o.service_types.map((t) => (
              <span key={t} style={{ ...O.docPill }}>{SERVICE_LABELS[t]}</span>
            ))
          )}
        </div>
      </div>

      <Photos o={o} canRemove={!isLive || o.photos.length > MIN_PHOTOS} flash={flash} />

      {modal === "edit" && form && (
        <Modal
          title={detailsLocked ? "Hours, phone and services" : "Premises details"}
          {...(detailsLocked ? { sub: "CRAL has these premises, so the name, address and county stay as sent." } : {})}
          width={720}
          onClose={() => setModal(null)}
          onConfirm={saveEdit}
          ctaLabel={update.isPending ? "Saving…" : "Save"}
          ctaDisabled={update.isPending}
        >
          <OutletFields value={form} onChange={setForm} showErrors={showErrors} detailsLocked={detailsLocked} />
          {showErrors && <div style={{ ...O.fieldError, marginTop: 10 }}>Check the highlighted fields.</div>}
          {!detailsLocked && o.visited && (
            <div style={{ ...O.helper, marginTop: 10 }}>Changing the name, address or county means CRAL visits again.</div>
          )}
        </Modal>
      )}

      {modal === "delete" && (
        <Modal
          title={`Remove ${o.name}?`}
          sub="Its photos are deleted too."
          onClose={() => setModal(null)}
          onConfirm={() =>
            remove.mutate(undefined, {
              onSuccess: () => {
                flash("Premises removed.", "#8C97A8");
                navigate("/premises");
              },
              onError: (err) => {
                setModal(null);
                fail(err);
              },
            })
          }
          ctaLabel={remove.isPending ? "Removing…" : "Remove premises"}
          ctaBg="#D81E32"
          ctaDisabled={remove.isPending}
        >
          <p style={{ ...P.lede, margin: 0 }}>This can't be undone.</p>
        </Modal>
      )}
    </div>
  );
}

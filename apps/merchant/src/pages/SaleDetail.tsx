import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { P } from "../components/portal/styles.js";
import { O } from "../components/onboarding/styles.js";
import { SALE_STATUS } from "../components/portal/status.js";
import { Modal } from "../components/portal/Modal.js";
import { useToast } from "../components/portal/Toast.js";
import { SaleFields, fromListing, saleFormErrors, toInput, type SaleFormValue } from "../components/sale/SaleFields.js";
import { SaleFiles } from "../components/sale/SaleFiles.js";
import {
  ACCIDENT_LABELS,
  BODY_LABELS,
  FULLY_EDITABLE,
  IMPORT_LABELS,
  OPEN_EDITABLE,
  fmtKes,
  useDeleteSaleListing,
  useSaleListing,
  useSetSaleStatus,
  useSubmitSaleListing,
  useUpdateSaleListing,
} from "../lib/sales-api.js";
import { usePageTitle } from "../lib/use-page-title.js";

/**
 * One car for sale (Phase 6 CS1, docs/decisions/car-sales.md). Not from a
 * canvas; built from tokens.ts and the portal's detail idiom
 * (PremisesDetail). The Ops review that moves it to live is CS2.
 */

type Confirm = null | "edit" | "delete" | "sold" | "withdrawn";

export function SaleDetail(): JSX.Element {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const flash = useToast();
  const { data: l, isPending, error } = useSaleListing(listingId);
  usePageTitle(l ? `${l.make} ${l.model}` : "Car for sale");

  const update = useUpdateSaleListing(listingId ?? "");
  const submit = useSubmitSaleListing(listingId ?? "");
  const setStatus = useSetSaleStatus(listingId ?? "");
  const remove = useDeleteSaleListing(listingId ?? "");

  const [modal, setModal] = useState<Confirm>(null);
  const [form, setForm] = useState<SaleFormValue | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  if (isPending) return <div style={{ color: "#838C9B" }}>Loading…</div>;
  if (error || !l) {
    return (
      <div>
        <button type="button" style={P.backLink} onClick={() => navigate("/sales")}>← Cars for sale</button>
        <p style={P.lede}>That listing isn't on your account.</p>
      </div>
    );
  }

  const meta = SALE_STATUS[l.status];
  const fullyEditable = FULLY_EDITABLE.includes(l.status);
  const openEditable = OPEN_EDITABLE.includes(l.status);
  const final = l.status === "sold" || l.status === "withdrawn";
  const fail = (err: unknown) => flash(err instanceof Error ? err.message : "Something went wrong. Try again.", "#FF8A8A");

  function openEdit() {
    setForm(fromListing(l!));
    setShowErrors(false);
    setModal("edit");
  }

  function saveEdit() {
    if (!form) return;
    if (Object.keys(saleFormErrors(form)).length > 0) {
      setShowErrors(true);
      return;
    }
    const input = toInput(form);
    // Live or paused: only what CRAL didn't check goes up.
    const body = fullyEditable
      ? input
      : { asking_price: input.asking_price, negotiable: input.negotiable, viewing_area: input.viewing_area, description: input.description };
    update.mutate(body, {
      onSuccess: () => {
        setModal(null);
        flash("Listing saved.", "#57D69E");
      },
      onError: fail,
    });
  }

  function move(to: "paused" | "live" | "sold" | "withdrawn", done: string) {
    setStatus.mutate(to, {
      onSuccess: () => {
        setModal(null);
        flash(done, "#8C97A8");
      },
      onError: (err) => {
        setModal(null);
        fail(err);
      },
    });
  }

  const facts: [string, string][] = [
    ["Body", BODY_LABELS[l.body_type]],
    ["Mileage", `${l.mileage_km.toLocaleString("en-KE")} km`],
    ["Gearbox", l.transmission === "automatic" ? "Automatic" : "Manual"],
    ["Fuel", l.fuel.charAt(0).toUpperCase() + l.fuel.slice(1)],
    ["Engine", l.engine_cc ? `${l.engine_cc.toLocaleString("en-KE")} cc` : "Not given"],
    ["Colour", l.colour ?? "Not given"],
    ["Import", IMPORT_LABELS[l.import_status]],
    ["Accidents", ACCIDENT_LABELS[l.accident_history]],
    ["Logbook", l.encumbered ? "A bank or lender is joint owner" : "Clear"],
    ["Known faults", l.known_faults],
    ["Viewing", `${l.viewing_area}, ${l.county}`],
  ];

  return (
    <div>
      <button type="button" style={P.backLink} onClick={() => navigate("/sales")}>← Cars for sale</button>

      <div style={P.mastCard}>
        <div style={P.mastTop}>
          <div>
            <div style={P.mastTagRow}>
              <span style={{ ...P.mastStatus, background: meta.tint, border: `1px solid ${meta.border}`, color: meta.text }}>
                <span style={{ ...P.mastStatusDot, background: meta.core }} />
                {meta.label}
              </span>
            </div>
            <h1 style={P.mastH1}>{l.year} {l.make} {l.model}</h1>
            <div style={P.mastSub}>
              {fmtKes(l.asking_price)} · {l.negotiable ? "Open to offers" : "Fixed price"}
            </div>
            <div style={P.mastSub}>{l.registration}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={P.mastRefLabel}>LISTING</div>
            <div style={P.mastRef}>{l.ref}</div>
          </div>
        </div>
        <div style={P.mastActions}>
          {fullyEditable && (
            <button
              type="button"
              style={{ ...P.actionBtn, minHeight: 44, background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" }}
              disabled={submit.isPending}
              onClick={() => submit.mutate(undefined, { onSuccess: () => flash("Sent. CRAL checks it before it goes up.", "#57D69E"), onError: fail })}
            >
              {submit.isPending ? "Sending…" : l.status === "draft" ? "Send to CRAL" : "Send again"}
            </button>
          )}
          {(fullyEditable || openEditable) && (
            <button type="button" style={{ ...P.actionBtn, minHeight: 44 }} onClick={openEdit}>
              {fullyEditable ? "Edit details" : "Edit price and description"}
            </button>
          )}
          {openEditable && (
            <>
              <button
                type="button"
                style={{ ...P.actionBtn, minHeight: 44 }}
                disabled={setStatus.isPending}
                onClick={() =>
                  l.status === "live" ? move("paused", "Paused. Buyers can't see it.") : move("live", "For sale again.")
                }
              >
                {l.status === "live" ? "Pause listing" : "Put back on sale"}
              </button>
              <button type="button" style={{ ...P.actionBtn, minHeight: 44 }} onClick={() => setModal("sold")}>Mark sold</button>
            </>
          )}
          {l.status === "draft" && (
            <button type="button" style={{ ...P.deleteBtn, minHeight: 44 }} onClick={() => setModal("delete")}>Delete draft</button>
          )}
          {l.status !== "draft" && !final && (
            <button type="button" style={{ ...P.deleteBtn, minHeight: 44 }} onClick={() => setModal("withdrawn")}>Withdraw</button>
          )}
        </div>
      </div>

      {l.reviewer_note && (l.status === "action" || l.status === "rejected" || l.status === "withdrawn") && (
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

      <div style={{ ...P.card, marginTop: 16, maxWidth: 820 }}>
        <div style={P.cardHead}>
          <span style={P.cardTitle}>The car</span>
        </div>
        <dl style={{ margin: 0, padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "12px 20px" }}>
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt style={O.panelGroupLabel}>{k.toUpperCase()}</dt>
              <dd style={{ margin: "4px 0 0", font: "400 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>{v}</dd>
            </div>
          ))}
        </dl>
        {l.description && <div style={P.cardFoot}>{l.description}</div>}
      </div>

      <SaleFiles l={l} editable={fullyEditable} flash={flash} />

      {modal === "edit" && form && (
        <Modal
          title={fullyEditable ? "Listing details" : "Price and description"}
          {...(!fullyEditable ? { sub: "CRAL checked the rest against the logbook, so it stays as approved." } : {})}
          width={720}
          onClose={() => setModal(null)}
          onConfirm={saveEdit}
          ctaLabel={update.isPending ? "Saving…" : "Save"}
          ctaDisabled={update.isPending}
        >
          <SaleFields value={form} onChange={setForm} showErrors={showErrors} checkedLocked={!fullyEditable} />
          {showErrors && <div style={{ ...O.fieldError, marginTop: 10 }}>Check the highlighted fields.</div>}
        </Modal>
      )}

      {modal === "sold" && (
        <Modal
          title="Mark this car sold?"
          sub="It comes off CRAL for good. This can't be undone."
          onClose={() => setModal(null)}
          onConfirm={() => move("sold", "Marked sold. Congratulations.")}
          ctaLabel={setStatus.isPending ? "Saving…" : "Mark sold"}
          ctaDisabled={setStatus.isPending}
        >
          <p style={{ ...P.lede, margin: 0 }}>Only do this once the buyer has paid you and the logbook transfer has started.</p>
        </Modal>
      )}

      {modal === "withdrawn" && (
        <Modal
          title="Withdraw this listing?"
          sub="It comes off CRAL for good. To sell the car later, list it again."
          onClose={() => setModal(null)}
          onConfirm={() => move("withdrawn", "Listing withdrawn.")}
          ctaLabel={setStatus.isPending ? "Withdrawing…" : "Withdraw"}
          ctaBg="#D81E32"
          ctaDisabled={setStatus.isPending}
        >
          <p style={{ ...P.lede, margin: 0 }}>
            {openEditable ? "To stop buyers seeing it for a while instead, pause it." : "CRAL stops checking it."}
          </p>
        </Modal>
      )}

      {modal === "delete" && (
        <Modal
          title="Delete this draft?"
          sub="Its photos and logbook are deleted too."
          onClose={() => setModal(null)}
          onConfirm={() =>
            remove.mutate(undefined, {
              onSuccess: () => {
                flash("Draft deleted.", "#8C97A8");
                navigate("/sales");
              },
              onError: (err) => {
                setModal(null);
                fail(err);
              },
            })
          }
          ctaLabel={remove.isPending ? "Deleting…" : "Delete draft"}
          ctaBg="#D81E32"
          ctaDisabled={remove.isPending}
        >
          <p style={{ ...P.lede, margin: 0 }}>This can't be undone.</p>
        </Modal>
      )}
    </div>
  );
}

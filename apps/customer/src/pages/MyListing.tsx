import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSeo } from "../lib/use-seo.js";
import { ApiClientError } from "../lib/api.js";
import { PageHero, Section, Card, Body, SectionTitle } from "../components/site/marketing.js";
import {
  PHOTO_LABELS,
  PHOTO_SLOTS,
  closeEnquiry,
  deleteListing,
  formToBody,
  kes,
  listingInbox,
  listingToForm,
  myListing,
  renewListing,
  replyEnquiry,
  setListingStatus,
  submitListing,
  updateListing,
  uploadListingFile,
  type DocSlot,
  type PhotoSlot,
  type SaleForm,
  type SellerEnquiry,
} from "../lib/sales-api.js";
import { SaleFormFields, saleFormIncomplete } from "../components/sale/SaleFormFields.js";
import { Button, Check, Notice, StatusChip, textareaStyle } from "../components/sale/ui.js";

const FREELY_EDITABLE = ["draft", "action", "rejected"];
const RE_REVIEW = ["live", "paused"];
const CLOSED = ["sold", "withdrawn", "expired", "removed"];

const DOC_WORD: Record<DocSlot["review_state"] | "missing", { label: string; color: string }> = {
  ok: { label: "Accepted", color: "#076945" },
  pending: { label: "Waiting for review", color: "#8A5200" },
  expiring: { label: "Expiring", color: "#8A5200" },
  rejected: { label: "Upload again", color: "#A50E22" },
  missing: { label: "Missing", color: "#838C9B" },
};

function FileRow({
  label,
  doc,
  optional,
  canUpload,
  accept,
  busy,
  onFile,
}: {
  label: string;
  doc: DocSlot | null;
  optional?: boolean;
  canUpload: boolean;
  accept: string;
  busy: boolean;
  onFile: (file: File) => void;
}): JSX.Element {
  const ref = useRef<HTMLInputElement>(null);
  const word = DOC_WORD[doc?.review_state ?? "missing"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid #EEF0F3", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
          {label}
          {optional && <span style={{ fontWeight: 400, color: "#838C9B" }}> · optional</span>}
        </div>
        <div style={{ font: "400 12.5px/1.45 'Instrument Sans',sans-serif", color: doc?.review_state === "rejected" ? "#A50E22" : "#5A6373" }}>
          {doc?.review_state === "rejected" && doc.review_note ? doc.review_note : doc ? doc.original_name : "Not uploaded yet"}
        </div>
      </div>
      {(doc || !optional) && <span style={{ font: "600 12px/1 'Instrument Sans',sans-serif", color: word.color }}>{word.label}</span>}
      {canUpload && (
        <>
          <input
            ref={ref}
            type="file"
            accept={accept}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" style={{ height: 34, padding: "0 12px", fontSize: 13 }} disabled={busy} onClick={() => ref.current?.click()}>
            {busy ? "Uploading..." : doc ? "Replace" : "Upload"}
          </Button>
        </>
      )}
    </div>
  );
}

function EnquiryCard({ e, onDone }: { e: SellerEnquiry; onDone: () => void }): JSX.Element {
  const [text, setText] = useState("");
  const [share, setShare] = useState(true);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    setErr(null);
    try {
      await replyEnquiry(e.id, { ...(text.trim() ? { message: text.trim() } : {}), share_phone: share });
      setOpen(false);
      onDone();
    } catch (x) {
      setErr(x instanceof ApiClientError ? x.message : "Couldn't send that.");
    }
  }
  return (
    <div style={{ padding: "12px 0", borderTop: "1px solid #EEF0F3" }}>
      <div style={{ font: "600 14px/1.4 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>
        {e.buyer_name} <span style={{ fontWeight: 400, color: "#838C9B" }}>· {new Date(e.created_at).toLocaleDateString("en-GB")}</span>
        {e.status === "new" && <span style={{ marginLeft: 8, color: "#0F23A8", fontSize: 12 }}>NEW</span>}
      </div>
      <div style={{ font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#333B4A", whiteSpace: "pre-wrap" }}>{e.message}</div>
      {e.viewing_window && <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>Viewing: {e.viewing_window}</div>}
      {e.reply && <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#076945" }}>You replied: {e.reply}</div>}
      {e.contact_shared && <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#076945" }}>Your number was shared.</div>}
      {e.status !== "closed" && !open && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Button variant="secondary" style={{ height: 34, fontSize: 13 }} onClick={() => setOpen(true)}>Reply</Button>
          <Button variant="secondary" style={{ height: 34, fontSize: 13 }} onClick={() => void closeEnquiry(e.id).then(onDone)}>Close</Button>
        </div>
      )}
      {open && (
        <div style={{ marginTop: 10 }}>
          <textarea value={text} onChange={(x) => setText(x.target.value)} style={textareaStyle} placeholder="Yes, it's available. Saturday morning works." />
          <div style={{ marginTop: 10 }}>
            <Check on={share} onToggle={() => setShare(!share)} label="Share my phone number" />
          </div>
          {err && <Notice tone="red">{err}</Notice>}
          <Button onClick={() => void send()} disabled={!share && !text.trim()}>Send reply</Button>
        </div>
      )}
    </div>
  );
}

/** One of a private seller's listings: what to do next, the eight photos and logbook, buyers' enquiries, and the seller's moves. */
export function MyListing(): JSX.Element {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: l, isLoading, error } = useQuery({ queryKey: ["my-sale-listing", id], queryFn: () => myListing(id) });
  const { data: inbox } = useQuery({ queryKey: ["my-sale-inbox", id], queryFn: () => listingInbox(id) });
  useSeo({ title: l ? l.title : "Your listing", path: `/my-listings/${id}` });

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [editing, setEditing] = useState<SaleForm | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["my-sale-listing", id] });
    void qc.invalidateQueries({ queryKey: ["my-sale-inbox", id] });
    void qc.invalidateQueries({ queryKey: ["my-sale-listings"] });
  };
  async function act(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "green", text: ok });
      refresh();
    } catch (err) {
      setMsg({ tone: "red", text: err instanceof ApiClientError ? err.message : "Something went wrong. Try again." });
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <Section><Body>Loading...</Body></Section>;
  if (error || !l) return <Section><Body>That listing isn't on your account. <Link to="/my-listings">Your listings</Link></Body></Section>;

  const canUpload = FREELY_EDITABLE.includes(l.status) || RE_REVIEW.includes(l.status);
  const carLocked = !FREELY_EDITABLE.includes(l.status) && !RE_REVIEW.includes(l.status);
  const closed = CLOSED.includes(l.status);
  const upload = (key: string, kind: Parameters<typeof uploadListingFile>[1], file: File, slot?: PhotoSlot) => {
    if (RE_REVIEW.includes(l.status) && !window.confirm("Changing a photo or paper takes the advert down until it has been read again. Go ahead?")) return;
    void act(key, () => uploadListingFile(id, kind, file, slot), "Uploaded.");
  };

  async function saveEdit() {
    if (!editing) return;
    if (saleFormIncomplete(editing)) {
      setShowErrors(true);
      return;
    }
    const full = formToBody(editing);
    const body = carLocked
      ? { asking_price: full.asking_price, negotiable: full.negotiable, county: full.county, viewing_area: full.viewing_area, description: full.description, auto_share_contact: full.auto_share_contact }
      : full;
    await act("edit", () => updateListing(id, body), "Saved.");
    setEditing(null);
  }

  return (
    <div>
      <PageHero kicker={l.ref ?? "YOUR LISTING"} title={l.title} sub={`${kes(l.asking_price)}${l.negotiable ? " · negotiable" : ""} · ${l.viewing_area}, ${l.county}`} />
      <Section>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <StatusChip status={l.status} />
          {l.status === "live" && l.expires_at && (
            <span style={{ font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>
              Listed until {new Date(l.expires_at).toLocaleDateString("en-GB")} · {l.view_count} views ·{" "}
              {l.ref && <Link to={`/buy/${l.ref}`}>See the advert</Link>}
            </span>
          )}
        </div>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {!l.seller_cleared && l.seller_gate_reason && !closed && (
          <Notice>
            {l.seller_gate_reason} <Link to="/documents">Your documents</Link>
          </Notice>
        )}
        {l.reviewer_note && ["action", "rejected", "removed"].includes(l.status) && <Notice tone="red">From the reviewer: {l.reviewer_note}</Notice>}
        {FREELY_EDITABLE.includes(l.status) && l.missing_for_submit.length > 0 && <Notice tone="blue">Still to add: {l.missing_for_submit.join(", ")}.</Notice>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {FREELY_EDITABLE.includes(l.status) && (
            <Button disabled={busy !== null || l.missing_for_submit.length > 0} onClick={() => void act("submit", () => submitListing(id), "Sent for review. Usually inside one working day.")}>
              {l.status === "draft" ? "Send for review" : "Send back for review"}
            </Button>
          )}
          {!closed && (
            <Button variant="secondary" onClick={() => { setEditing(listingToForm(l)); setShowErrors(false); }}>
              {carLocked ? "Edit price and viewing" : "Edit details"}
            </Button>
          )}
          {l.status === "live" && <Button variant="secondary" onClick={() => void act("offer", () => setListingStatus(id, "under_offer"), "Marked under offer.")}>Mark under offer</Button>}
          {l.status === "live" && <Button variant="secondary" onClick={() => void act("pause", () => setListingStatus(id, "paused"), "Paused.")}>Pause</Button>}
          {(l.status === "paused" || l.status === "under_offer") && <Button variant="secondary" onClick={() => void act("live", () => setListingStatus(id, "live"), "Back on sale.")}>Put back on sale</Button>}
          {["live", "paused", "under_offer"].includes(l.status) && (
            <Button
              variant="secondary"
              onClick={() => {
                if (!window.confirm("Mark this car sold? It comes off sale for good.")) return;
                const via = window.confirm("Did the buyer find it on CRAL? OK for yes, Cancel for no.");
                void act("sold", () => setListingStatus(id, "sold", via), "Marked sold. Congratulations.");
              }}
            >
              Mark sold
            </Button>
          )}
          {(l.status === "expired" || (l.status === "live" && l.expires_at && new Date(l.expires_at).getTime() - Date.now() < 7 * 86_400_000)) && <Button variant="secondary" onClick={() => void act("renew", () => renewListing(id), "Renewed for 60 days.")}>Renew for 60 days</Button>}
          {l.status === "draft" ? (
            <Button variant="danger" onClick={() => window.confirm("Delete this draft and its photos?") && void act("delete", () => deleteListing(id), "Deleted.").then(() => navigate("/my-listings"))}>Delete draft</Button>
          ) : (
            !closed && <Button variant="danger" onClick={() => window.confirm("Withdraw this listing? Buyers can no longer see it.") && void act("withdraw", () => setListingStatus(id, "withdrawn"), "Withdrawn.")}>Withdraw</Button>
          )}
        </div>

        {editing && (
          <Card>
            <SaleFormFields value={editing} onChange={setEditing} showErrors={showErrors} carLocked={carLocked} />
            {RE_REVIEW.includes(l.status) && <Body>Changing the car's details takes the advert down until it has been read again. Price and viewing changes stay live.</Body>}
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={() => void saveEdit()} disabled={busy === "edit"}>Save</Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </Card>
        )}

        <Card>
          <SectionTitle>Buyer enquiries</SectionTitle>
          {!inbox || inbox.data.length === 0 ? (
            <Body>{l.status === "live" ? "No enquiries yet. You are told the moment a buyer asks." : "Enquiries appear here once the car is listed."}</Body>
          ) : (
            inbox.data.map((e) => <EnquiryCard key={e.id} e={e} onDone={refresh} />)
          )}
        </Card>

        <Card>
          <SectionTitle>Papers</SectionTitle>
          <FileRow label="Logbook" doc={l.documents.logbook} canUpload={canUpload} accept="application/pdf,image/jpeg,image/png" busy={busy === "logbook"} onFile={(f) => upload("logbook", "logbook", f)} />
          <FileRow label="Bank clearance letter" optional doc={l.documents.bank_clearance_letter} canUpload={canUpload} accept="application/pdf,image/jpeg,image/png" busy={busy === "bank"} onFile={(f) => upload("bank", "bank_clearance_letter", f)} />
          <FileRow label="NTSA official search" optional doc={l.documents.ntsa_search} canUpload={canUpload} accept="application/pdf,image/jpeg,image/png" busy={busy === "ntsa"} onFile={(f) => upload("ntsa", "ntsa_search", f)} />
        </Card>

        <Card>
          <SectionTitle>The eight photos</SectionTitle>
          <Body>Daylight, the whole car in frame. The reviewer checks the plate and the chassis plate against the logbook.</Body>
          {PHOTO_SLOTS.map((slot) => (
            <FileRow key={slot} label={PHOTO_LABELS[slot]} doc={l.documents.photos[slot]} canUpload={canUpload} accept="image/jpeg,image/png,image/webp" busy={busy === slot} onFile={(f) => upload(slot, "sale_photo", f, slot)} />
          ))}
        </Card>
      </Section>
    </div>
  );
}

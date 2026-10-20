import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  decideSale,
  decideSaleDocument,
  fetchSaleCase,
  kes,
  reinstateSale,
  removeSale,
  resolveReport,
  saleDocObjectUrl,
  setSaleCheck,
  type CheckItem,
  type DocLine,
  type SaleCase,
} from "../../lib/sales-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import { SALE_STATUS } from "./Queue.js";

const SECTION_TITLE: Record<CheckItem["section"], string> = {
  logbook: "Logbook against the listing",
  photos: "Photos against the logbook",
  listing: "The advert itself",
};
const IMPORT: Record<string, string> = { foreign_used: "Foreign used", locally_used: "Locally used", new: "New" };
const OPEN = ["pending", "review"];
const LISTED = ["live", "paused", "under_offer"];

/**
 * One car-sale case (docs/plans/car-sales.md). Left to right in reading
 * order: what the seller typed, the logbook and photos, then the
 * checklist that compares them. Built in drivers/Case.tsx's idiom - there
 * is no canvas for sales. Every check must be answered and none flagged
 * before Approve; Request changes and Reject only need a note.
 */
export function Case(): JSX.Element {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const key = ["admin", "sales", listingId];
  const { data: c, isLoading, error } = useQuery({ queryKey: key, queryFn: () => fetchSaleCase(listingId!), enabled: !!listingId });
  usePageTitle(c ? c.title : "Car sale");

  const [decision, setDecision] = useState<null | "request_changes" | "reject" | "remove">(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const photoIds = c?.photos.map((p) => p.doc?.document_id).filter(Boolean).join(",") ?? "";
  useEffect(() => {
    if (!c) return;
    let cancelled = false;
    const urls: string[] = [];
    void Promise.all(
      c.photos
        .filter((p) => p.doc)
        .map(async (p) => {
          const u = await saleDocObjectUrl(c.id, p.doc!.document_id).catch(() => null);
          if (u) urls.push(u);
          return [p.slot, u] as const;
        }),
    ).then((pairs) => {
      if (!cancelled) setThumbs(Object.fromEntries(pairs.filter(([, u]) => u)) as Record<string, string>);
    });
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // Re-fetch only when the set of photos changes, not on every case refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoIds]);

  const onDone = (updated: SaleCase) => {
    qc.setQueryData(key, updated);
    void qc.invalidateQueries({ queryKey: ["admin", "sales", "list"] });
    setErr(null);
  };
  const onFail = (e: unknown) => setErr(e instanceof Error ? e.message : "That didn't go through. Try again.");

  const checkMut = useMutation({
    mutationFn: (v: { item: string; result: CheckItem["result"]; note?: string }) => setSaleCheck(listingId!, v.item, v.result, v.note),
    onSuccess: onDone,
    onError: onFail,
  });
  const docMut = useMutation({
    mutationFn: (v: { documentId: string; decision: "accept" | "reject"; note?: string }) =>
      decideSaleDocument(listingId!, v.documentId, v.decision, v.note),
    onSuccess: onDone,
    onError: onFail,
  });
  const decideMut = useMutation({
    mutationFn: (v: { action: "approve" | "request_changes" | "reject" | "remove" | "reinstate"; note?: string }) =>
      v.action === "remove"
        ? removeSale(listingId!, v.note ?? "")
        : v.action === "reinstate"
          ? reinstateSale(listingId!)
          : decideSale(listingId!, v.action, v.note),
    onSuccess: (u) => {
      onDone(u);
      setDecision(null);
      setNote("");
    },
    onError: onFail,
  });
  const reportMut = useMutation({
    mutationFn: (v: { id: string; outcome: "dismissed" | "actioned" }) => resolveReport(v.id, v.outcome),
    onSuccess: onDone,
    onError: onFail,
  });

  if (isLoading) return <div style={S.empty}>Loading…</div>;
  if (error || !c) return <div style={S.empty}>Couldn't load that listing.</div>;

  const s = SALE_STATUS[c.status];
  const open = OPEN.includes(c.status);
  const blockingDocs =
    !c.documents.find((d) => d.kind === "logbook")?.doc ||
    c.documents.some((d) => d.required && d.doc?.state === "rejected") ||
    c.photos.some((p) => !p.doc || p.doc.state === "rejected");
  const canApprove = open && c.seller.cleared && c.checklist.complete && c.checklist.flagged === 0 && !blockingDocs;
  const approveWhy = !c.seller.cleared
    ? "The seller isn't verified yet."
    : blockingDocs
      ? "The logbook and all eight photos need a good upload."
      : !c.checklist.complete
        ? `${c.checklist.outstanding} checks still open.`
        : c.checklist.flagged
          ? "Something is flagged - request changes or reject."
          : undefined;
  const sellerLink = c.seller.merchant_id ? `/merchants/${c.seller.merchant_id}` : `/renters/${c.seller.user_id}`;
  const openReports = c.reports.filter((r) => r.status === "open");

  return (
    <div>
      <button type="button" onClick={() => navigate("/sales")} style={S.backBtn}>← All car sales</button>

      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>{c.title}</h1>
          <p style={S.lede}>
            {kes(c.asking_price)}
            {c.negotiable ? " · negotiable" : ""} · {c.viewing_area}, {c.county}
            {c.ref ? ` · ${c.ref}` : ""}
          </p>
        </div>
        <span style={{ ...S.badge, background: s.bg, borderColor: s.border, color: s.fg }}>{s.label}</span>
      </div>

      {openReports.length > 0 && (
        <div style={{ ...S.warn, background: "#FDE7EA", borderColor: "#F7BDC5", color: "#A50E22" }}>
          <strong>{openReports.length} open {openReports.length === 1 ? "report" : "reports"} from buyers.</strong>
          {openReports.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
              <span style={{ flex: 1, minWidth: 200 }}>
                {r.reason.replace("_", " ")}
                {r.note ? ` - "${r.note}"` : ""}
              </span>
              <button type="button" style={S.btn} disabled={reportMut.isPending} onClick={() => reportMut.mutate({ id: r.id, outcome: "dismissed" })}>Dismiss</button>
              <button type="button" style={S.btn} disabled={reportMut.isPending} onClick={() => reportMut.mutate({ id: r.id, outcome: "actioned" })}>Mark handled</button>
            </div>
          ))}
        </div>
      )}

      <div style={S.facts}>
        <Fact label="PLATE" value={c.car.registration} mono />
        <Fact label="CHASSIS" value={c.car.chassis_number} mono />
        <Fact label="YEAR" value={String(c.car.year)} />
        <Fact label="MILEAGE" value={`${c.car.mileage_km.toLocaleString("en-KE")} km`} />
        <Fact label="ORIGIN" value={IMPORT[c.car.import_status] ?? c.car.import_status} />
        <Fact label="GEARBOX / FUEL" value={`${c.car.transmission} · ${c.car.fuel}`} />
      </div>

      <div style={S.panel}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>The seller</span>
          <span style={{ ...S.mono, color: c.seller.cleared ? "#076945" : "#8A5200" }}>{c.seller.cleared ? "VERIFIED" : "NOT VERIFIED"}</span>
        </div>
        <div style={{ padding: "14px 18px", display: "grid", gap: 4 }}>
          <div style={S.panelTitle}>
            <Link to={sellerLink} style={{ color: "#0F23A8", textDecoration: "none" }}>{c.seller.legal_name}</Link>
            <span style={{ fontWeight: 400, color: "#5A6373" }}>
              {" "}· {c.seller.type === "private" ? "private seller" : c.seller.owner_type === "company" ? "company merchant" : "merchant"}
            </span>
          </div>
          <div style={S.small}>Hold this name against the name on the logbook.</div>
          <div style={S.small}>{c.seller.email} · {c.seller.phone ?? "no phone"}{c.seller.phone_verified ? " (verified)" : ""}</div>
          {!c.seller.cleared && c.seller.gate_reason && (
            <div style={{ ...S.small, color: "#8A5200" }}>
              {c.seller.gate_reason} <Link to={sellerLink} style={{ color: "#0F23A8", fontWeight: 600 }}>{c.seller.type === "merchant" ? "Review the account" : "Open the renter file"}</Link>
            </div>
          )}
        </div>
      </div>

      <div style={{ ...S.panel, marginTop: 16 }}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>What the seller declared</span>
        </div>
        <div style={{ padding: "14px 18px", display: "grid", gap: 8 }}>
          <div>
            <div style={S.mono}>KNOWN FAULTS</div>
            <div style={{ ...S.body, whiteSpace: "pre-wrap" }}>{c.disclosures.known_faults}</div>
          </div>
          <div style={S.body}>
            Accident: {c.disclosures.accident_history}
            {c.disclosures.accident_note ? ` - ${c.disclosures.accident_note}` : ""} · Bank on logbook: {c.disclosures.encumbered ? "yes" : "no"} · Service history: {c.disclosures.service_history}
          </div>
          {c.description && (
            <div>
              <div style={S.mono}>DESCRIPTION</div>
              <div style={{ ...S.body, whiteSpace: "pre-wrap" }}>{c.description}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ ...S.panel, marginTop: 16 }}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>Papers</span>
        </div>
        {c.documents.map((d) => (
          <DocRow
            key={d.kind}
            listingId={c.id}
            label={d.label + (d.required ? "" : " (optional)")}
            doc={d.doc}
            busy={docMut.isPending}
            onDecide={(decision, n) => d.doc && docMut.mutate({ documentId: d.doc.document_id, decision, ...(n ? { note: n } : {}) })}
          />
        ))}
      </div>

      <div style={{ ...S.panel, marginTop: 16 }}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>The eight photos</span>
          <span style={S.mono}>{c.photos.filter((p) => p.doc).length}/8 UPLOADED</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,180px),1fr))", gap: 12, padding: 18 }}>
          {c.photos.map((p) => (
            <div key={p.slot}>
              <button
                type="button"
                disabled={!p.doc}
                onClick={() => thumbs[p.slot] && window.open(thumbs[p.slot], "_blank")}
                style={{ display: "block", width: "100%", aspectRatio: "4 / 3", padding: 0, border: `2px solid ${p.doc?.state === "rejected" ? "#D81E32" : "#E4E7EC"}`, borderRadius: 8, overflow: "hidden", background: "#F1F3F6", cursor: p.doc ? "zoom-in" : "default" }}
              >
                {thumbs[p.slot] ? (
                  <img src={thumbs[p.slot]} alt={p.label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <span style={S.small}>{p.doc ? "Loading…" : "Missing"}</span>
                )}
              </button>
              <div style={{ ...S.small, marginTop: 6, color: "#1A1F2B", fontWeight: 600 }}>{p.label}</div>
              {p.doc?.state === "rejected" && <div style={{ ...S.small, color: "#A50E22" }}>{p.doc.review_note ?? "Asked for again"}</div>}
              {p.doc && open && p.doc.state !== "rejected" && (
                <PhotoReject busy={docMut.isPending} onReject={(n) => docMut.mutate({ documentId: p.doc!.document_id, decision: "reject", note: n })} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...S.panel, marginTop: 16 }}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>Checklist</span>
          <span style={{ ...S.mono, color: c.checklist.complete && !c.checklist.flagged ? "#076945" : "#9AA2B0" }}>
            {c.checklist.items.length - c.checklist.outstanding}/{c.checklist.items.length} ANSWERED{c.checklist.flagged ? ` · ${c.checklist.flagged} FLAGGED` : ""}
          </span>
        </div>
        {(["logbook", "photos", "listing"] as const).map((section) => (
          <div key={section}>
            <div style={{ ...S.mono, padding: "12px 18px 4px" }}>{SECTION_TITLE[section].toUpperCase()}</div>
            {c.checklist.items
              .filter((i) => i.section === section)
              .map((item) => (
                <CheckRow
                  key={item.id}
                  item={item}
                  disabled={!open || checkMut.isPending}
                  onSet={(result, n) => checkMut.mutate({ item: item.id, result, ...(n ? { note: n } : {}) })}
                />
              ))}
          </div>
        ))}
      </div>

      {err && <div style={{ ...S.warn, marginTop: 16, background: "#FDE7EA", borderColor: "#F7BDC5", color: "#A50E22" }}>{err}</div>}

      {(open || LISTED.includes(c.status) || c.status === "removed") && (
        <div style={{ ...S.panel, padding: 18, marginTop: 16, position: "sticky", bottom: 12, boxShadow: "0 6px 24px rgba(11,15,26,.08)" }}>
          {decision ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={S.panelTitle}>
                {decision === "reject" ? "Don't list this car" : decision === "remove" ? "Take this listing down" : "Ask the seller for a change"}
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the seller reads - quoted verbatim." style={S.textarea} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" style={S.btn} onClick={() => { setDecision(null); setNote(""); }}>Cancel</button>
                <button
                  type="button"
                  disabled={!note.trim() || decideMut.isPending}
                  style={{ ...S.btn, background: "#D81E32", borderColor: "#D81E32", color: "#FFFFFF" }}
                  onClick={() => decideMut.mutate({ action: decision, note: note.trim() })}
                >
                  {decision === "reject" ? "Reject" : decision === "remove" ? "Take down" : "Send"}
                </button>
              </div>
            </div>
          ) : open ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                disabled={!canApprove || decideMut.isPending}
                title={approveWhy}
                style={{ ...S.btn, background: canApprove ? "#0B8A5B" : "#F1F3F6", borderColor: canApprove ? "#0B8A5B" : "#E4E7EC", color: canApprove ? "#FFFFFF" : "#9AA2B0" }}
                onClick={() => decideMut.mutate({ action: "approve" })}
              >
                Approve and list
              </button>
              <button type="button" style={S.btn} onClick={() => { setDecision("request_changes"); setNote(c.checklist.suggested_note); }}>Request changes</button>
              <button type="button" style={{ ...S.btn, color: "#D81E32", borderColor: "#F7BDC5" }} onClick={() => { setDecision("reject"); setNote(c.checklist.suggested_note); }}>Reject</button>
              {approveWhy && <span style={S.small}>{approveWhy}</span>}
            </div>
          ) : c.status === "removed" ? (
            <button type="button" style={S.btn} disabled={decideMut.isPending} onClick={() => decideMut.mutate({ action: "reinstate" })}>Reinstate the listing</button>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" style={{ ...S.btn, color: "#D81E32", borderColor: "#F7BDC5" }} onClick={() => setDecision("remove")}>Take down</button>
              <span style={S.small}>
                Listed{c.live_at ? ` ${new Date(c.live_at).toLocaleDateString("en-GB")}` : ""} · {c.view_count} views
                {c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleDateString("en-GB")}` : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={S.mono}>{label}</span>
      <span style={{ ...S.factValue, ...(mono ? { fontFamily: "'IBM Plex Mono',monospace", fontWeight: 500 } : {}) }}>{value}</span>
    </div>
  );
}

function CheckRow({
  item,
  disabled,
  onSet,
}: {
  item: CheckItem;
  disabled: boolean;
  onSet: (result: CheckItem["result"], note?: string) => void;
}): JSX.Element {
  const [flagging, setFlagging] = useState(false);
  const [note, setNote] = useState(item.note ?? "");
  const pass = item.result === "pass";
  const flag = item.result === "flag";
  return (
    <div style={{ padding: "10px 18px", borderTop: "1px solid #F1F3F6", background: flag ? "#FFF8F8" : "#FFFFFF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ width: 18, font: "600 13px/1 'Instrument Sans',sans-serif", color: pass ? "#0B8A5B" : flag ? "#D81E32" : "#CDD2DA" }}>
          {pass ? "✓" : flag ? "!" : "○"}
        </span>
        <span style={{ flex: 1, minWidth: 220, font: "400 13.5px/1.45 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>
          {item.label}
          {flag && item.note && <span style={{ display: "block", color: "#A50E22" }}>{item.note}</span>}
        </span>
        <button
          type="button"
          disabled={disabled}
          style={{ ...S.btn, background: pass ? "#0B8A5B" : "#FFFFFF", color: pass ? "#FFFFFF" : "#0B8A5B", borderColor: pass ? "#0B8A5B" : "#A8DEC7" }}
          onClick={() => onSet(pass ? "pending" : "pass")}
        >
          Pass
        </button>
        <button
          type="button"
          disabled={disabled}
          style={{ ...S.btn, background: flag ? "#D81E32" : "#FFFFFF", color: flag ? "#FFFFFF" : "#D81E32", borderColor: flag ? "#D81E32" : "#F7BDC5" }}
          onClick={() => (flag ? onSet("pending") : setFlagging(true))}
        >
          Flag
        </button>
      </div>
      {flagging && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is wrong - this goes into the note to the seller." style={S.textarea} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={S.btn} onClick={() => setFlagging(false)}>Cancel</button>
            <button
              type="button"
              style={{ ...S.btn, background: "#D81E32", color: "#FFFFFF", borderColor: "#D81E32" }}
              onClick={() => { onSet("flag", note.trim() || undefined); setFlagging(false); }}
            >
              Flag it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoReject({ busy, onReject }: { busy: boolean; onReject: (note: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!open) {
    return (
      <button type="button" style={{ ...S.linkBtn }} onClick={() => setOpen(true)}>
        Ask for a new one
      </button>
    );
  }
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why - the seller reads this" style={{ ...S.textarea, minHeight: 0, height: 32, padding: "0 8px" }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" style={S.btn} onClick={() => setOpen(false)}>Cancel</button>
        <button
          type="button"
          disabled={busy || !note.trim()}
          style={{ ...S.btn, background: "#D81E32", color: "#FFFFFF", borderColor: "#D81E32" }}
          onClick={() => { onReject(note.trim()); setOpen(false); }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function DocRow({
  listingId,
  label,
  doc,
  busy,
  onDecide,
}: {
  listingId: string;
  label: string;
  doc: DocLine | null;
  busy: boolean;
  onDecide: (decision: "accept" | "reject", note?: string) => void;
}): JSX.Element {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const accepted = doc?.state === "ok";
  const rejected = doc?.state === "rejected";
  const dot = accepted ? "#0B8A5B" : rejected ? "#D81E32" : !doc ? "#E4E7EC" : "#C77400";
  return (
    <div style={{ padding: "14px 18px", borderBottom: "1px solid #F1F3F6", background: rejected ? "#FDE7EA" : "#FFFFFF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flex: "none" }} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={S.panelTitle}>{label}</div>
          <div style={{ ...S.small, color: rejected ? "#D81E32" : accepted ? "#0B8A5B" : "#838C9B" }}>
            {!doc ? "Not uploaded" : rejected ? (doc.review_note ?? "Asked for again") : accepted ? "Accepted" : "Read it with the checklist below"}
          </div>
        </div>
        <button
          type="button"
          disabled={!doc}
          onClick={() => doc && saleDocObjectUrl(listingId, doc.document_id).then((u) => window.open(u, "_blank")).catch(() => {})}
          style={{ ...S.btn, opacity: doc ? 1 : 0.4 }}
        >
          Open scan
        </button>
        {doc && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide("accept")}
              style={{ ...S.btn, background: accepted ? "#0B8A5B" : "#FFFFFF", color: accepted ? "#FFFFFF" : "#0B8A5B", borderColor: accepted ? "#0B8A5B" : "#A8DEC7" }}
            >
              Accept
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting((v) => !v)}
              style={{ ...S.btn, background: rejected ? "#D81E32" : "#FFFFFF", color: rejected ? "#FFFFFF" : "#D81E32", borderColor: rejected ? "#D81E32" : "#F7BDC5" }}
            >
              Ask for a new upload
            </button>
          </div>
        )}
      </div>
      {rejecting && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the seller reads - quoted verbatim." style={S.textarea} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={S.btn} onClick={() => { setRejecting(false); setNote(""); }}>Cancel</button>
            <button
              type="button"
              disabled={busy || !note.trim()}
              style={{ ...S.btn, background: "#D81E32", color: "#FFFFFF", borderColor: "#D81E32" }}
              onClick={() => { onDecide("reject", note.trim()); setRejecting(false); setNote(""); }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  backBtn: { height: 34, padding: "0 4px", background: "none", border: "none", font: "600 13px/1 'Instrument Sans',sans-serif", color: "#5A6373", cursor: "pointer", marginBottom: 10 },
  headRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 },
  h1: { margin: "0 0 4px", font: "600 clamp(23px,3vw,28px)/1.15 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.02em", color: "#1A1F2B" },
  lede: { margin: 0, font: "400 14px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  badge: { display: "inline-flex", alignItems: "center", padding: "5px 11px", border: "1px solid", borderRadius: 999, font: "600 11px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".05em", flex: "none" },
  facts: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))", gap: 16, marginBottom: 18 },
  factValue: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B", overflow: "hidden", textOverflow: "ellipsis" },
  mono: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  warn: { padding: "12px 14px", marginBottom: 16, background: "#FFF3DB", border: "1px solid #F5D9A3", borderRadius: "var(--r)", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#8A5200" },
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 18px", borderBottom: "1px solid #F1F3F6" },
  panelTitle: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" },
  body: { font: "400 13.5px/1.55 'Instrument Sans',sans-serif", color: "#333B4A", marginTop: 4 },
  small: { font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#5A6373" },
  btn: { height: 32, padding: "0 12px", background: "#FFFFFF", color: "#0F23A8", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  linkBtn: { padding: 0, marginTop: 4, background: "none", border: "none", color: "#D81E32", font: "500 12px/1.4 'Instrument Sans',sans-serif", cursor: "pointer", textDecoration: "underline" },
  textarea: { width: "100%", minHeight: 70, padding: 12, border: "1.5px solid #E4E7EC", borderRadius: "var(--r)", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#1A1F2B", background: "#FFFFFF", resize: "vertical" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;

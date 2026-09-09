import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignCase,
  decideDocument,
  decideListing,
  documentObjectUrl,
  fetchCase,
  setChecklistItem,
  type CheckResult,
  type DocLine,
  type ReviewCase,
} from "../../lib/vehicles-api.js";
import { ChecklistRow } from "../../components/console/ChecklistPanel.js";
import { ApiClientError } from "../../lib/api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import {
  ageBadge,
  DOC_DOT,
  money,
  REASON_TEMPLATES,
  statusTone,
  TONE_DOT,
} from "../../components/console/status.js";

type Modal =
  | { kind: "approve" }
  | { kind: "changes" }
  | { kind: "reject" }
  | { kind: "doc"; line: DocLine }
  | null;

export function Case(): JSX.Element {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ text: string; dot: string } | null>(null);

  const { data: c, isLoading, error } = useQuery({
    queryKey: ["admin", "vehicles", "case", vehicleId],
    queryFn: () => fetchCase(vehicleId!),
    enabled: !!vehicleId,
  });
  usePageTitle(c ? c.registration : "Vehicle review");

  const flash = (text: string, dot = "#0B8A5B") => {
    setToast({ text, dot });
    window.setTimeout(() => setToast(null), 3600);
  };
  const onCase = (next: ReviewCase) => {
    qc.setQueryData(["admin", "vehicles", "case", vehicleId], next);
    void qc.invalidateQueries({ queryKey: ["admin", "vehicles", "queue"] });
  };

  const assign = useMutation({
    mutationFn: () => assignCase(vehicleId!),
    onSuccess: (next) => {
      onCase(next);
      flash(`${next.registration} is in your queue.`, "#0B7BC1");
    },
  });
  const docDecision = useMutation({
    mutationFn: (v: { kind: string; decision: "accept" | "reject"; note?: string }) =>
      decideDocument(vehicleId!, v.kind, v.decision, v.note),
    onSuccess: (next, v) => {
      onCase(next);
      flash(v.decision === "accept" ? "Document accepted." : "Marked for rework — the merchant has been told.", v.decision === "accept" ? "#0B8A5B" : "#C77400");
      setModal(null);
    },
    onError: (e) => flash(e instanceof ApiClientError ? e.message : "That didn't work.", "#D81E32"),
  });
  const checklistMut = useMutation({
    mutationFn: (v: { itemId: string; result: CheckResult; note?: string }) =>
      setChecklistItem(vehicleId!, v.itemId, v.result, v.note),
    onSuccess: onCase,
    onError: (e) => flash(e instanceof ApiClientError ? e.message : "That didn't save.", "#D81E32"),
  });
  const listingDecision = useMutation({
    mutationFn: (v: { action: "approve" | "request_changes" | "reject"; note?: string }) =>
      decideListing(vehicleId!, v.action, v.note),
    onSuccess: (next, v) => {
      onCase(next);
      setModal(null);
      flash(
        v.action === "approve"
          ? `${next.registration} is live. The merchant has been told.`
          : v.action === "request_changes"
            ? `Sent to ${next.merchant.name}. The case is with them now.`
            : `${next.registration} rejected and closed.`,
        v.action === "approve" ? "#0B8A5B" : v.action === "request_changes" ? "#C77400" : "#D81E32",
      );
    },
    onError: (e) => flash(e instanceof ApiClientError ? e.message : "That didn't work.", "#D81E32"),
  });

  if (isLoading) return <div style={CS.loading}>Loading the case…</div>;
  if (error || !c) {
    return (
      <div style={CS.loading}>
        Couldn't load that case.{" "}
        <button type="button" style={CS.link} onClick={() => navigate("/vehicles")}>
          Back to the queue
        </button>
      </div>
    );
  }

  const tone = statusTone(c.status);
  const age = ageBadge(c.waiting_hours, c.sla_days);

  return (
    <div>
      <button type="button" onClick={() => navigate("/vehicles")} style={CS.back}>
        ‹ Back to vehicle review
      </button>

      {/* header */}
      <div style={CS.card}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap", marginBottom: 9 }}>
              <span style={CS.plateLg}>{c.registration}</span>
              <span style={{ ...CS.statePill, background: tone.tint, borderColor: tone.border, color: tone.text }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: tone.core }} />
                {tone.label}
              </span>
              <span style={{ ...CS.agePill, background: age.bg, color: age.fg }}>{age.long}</span>
            </div>
            <h1 style={CS.h1}>{c.title}</h1>
            <div style={CS.subline}>
              {c.type} · {c.year} · {c.transmission} · {c.seats} seats · {c.county ?? "—"}
              {c.pickup_address ? ` · ${c.pickup_address}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right", marginLeft: "auto", flex: "none" }}>
            <div style={CS.kicker}>LISTING REF</div>
            <div style={CS.refChip}>{c.listing_ref ?? "—"}</div>
            <div style={{ font: "400 11px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".04em", color: "#838C9B" }}>
              SUBMITTED {new Date(c.submitted_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
            </div>
          </div>
        </div>

        <div style={CS.actions}>
          <button
            type="button"
            onClick={() =>
              c.can_approve
                ? setModal({ kind: "approve" })
                : flash(
                    c.approve_blockers.merchant_not_approved
                      ? "Approve the business on the merchant file first."
                      : c.approve_blockers.documents > 0
                        ? `${c.approve_blockers.documents} car document${c.approve_blockers.documents === 1 ? "" : "s"} still to accept.`
                        : `${c.approve_blockers.checklist} checklist blocker${c.approve_blockers.checklist === 1 ? "" : "s"} still open.`,
                    "#C77400",
                  )
            }
            style={{ ...CS.actBtn, background: c.can_approve ? "#0B8A5B" : "#076945", color: "#fff", cursor: c.can_approve ? "pointer" : "not-allowed" }}
          >
            Approve &amp; publish
          </button>
          <button type="button" onClick={() => setModal({ kind: "changes" })} style={{ ...CS.actBtn, background: "#FFFFFF", color: "#8A5200", border: "1px solid #F5D9A3" }}>
            Request changes
          </button>
          <button type="button" onClick={() => setModal({ kind: "reject" })} style={{ ...CS.actBtn, background: "#FFFFFF", color: "#A50E22", border: "1px solid #F7BDC5" }}>
            Reject
          </button>
          <button
            type="button"
            onClick={() => (c.assigned_to_me ? flash("Already yours.", "#838C9B") : assign.mutate())}
            disabled={assign.isPending}
            style={{ ...CS.actBtn, marginLeft: "auto", background: "#FFFFFF", color: c.assigned_to_me ? "#9AA2B0" : "#0F23A8", border: "1px solid #E4E7EC" }}
          >
            {c.assigned_to_me ? "Assigned to you" : "Assign to me"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* left column */}
        <div style={{ flex: 1.55, minWidth: 320, display: "grid", gap: 16 }}>
          <section style={CS.panel}>
            <div style={CS.panelHead}>
              <div>
                <div style={CS.panelTitle}>Documents</div>
                <div style={CS.panelSub}>Every line must be accepted before the listing can go live.</div>
              </div>
              <span style={{ font: "500 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: c.can_approve ? "#0B8A5B" : "#C77400" }}>
                {c.documents.filter((d) => d.state === "ok").length} OF {c.documents.length} ACCEPTED
              </span>
            </div>
            {c.documents.map((d) => (
              <DocRow
                key={d.kind}
                line={d}
                busy={docDecision.isPending}
                checkBusy={checklistMut.isPending}
                onView={() => d.document_id && setModal({ kind: "doc", line: d })}
                onAccept={() => docDecision.mutate({ kind: d.kind, decision: "accept" })}
                onRejectWithNote={(note) => docDecision.mutate({ kind: d.kind, decision: "reject", note })}
                onSetCheck={(itemId, result, note) =>
                  checklistMut.mutate({ itemId, result, ...(note ? { note } : {}) })
                }
              />
            ))}
            <div style={CS.panelFoot}>
              Work each document's checklist - when every MUST&nbsp;PASS line is ticked the document is
              accepted for you. A rejected line is quoted to the merchant word for word.
            </div>
          </section>

          <section style={CS.panel}>
            <div style={CS.panelHead}>
              <div>
                <div style={CS.panelTitle}>Owner documents</div>
                <div style={CS.panelSub}>
                  {c.merchant_approved
                    ? "Verified with the account - not re-checked per car."
                    : "Reviewed on the merchant file, not here. The business isn't approved yet."}
                </div>
              </div>
              {!c.merchant_approved && (
                <button type="button" onClick={() => navigate(`/merchants/${c.merchant.id}`)} style={CS.smallBtn}>
                  Open merchant file
                </button>
              )}
            </div>
            {c.account_documents.map((d) => (
              <div key={d.kind} style={{ ...CS.docRow, borderBottom: "1px solid #F1F3F6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: d.verified_with_account || d.state === "ok" ? "#0B8A5B" : d.state === "rejected" ? "#D81E32" : "#C77400",
                      flex: "none",
                    }}
                  />
                  <span style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B", flex: 1 }}>{d.label}</span>
                  <span style={{ font: "500 11px/1.3 'IBM Plex Mono',monospace", color: "#838C9B" }}>
                    {d.verified_with_account ? "VERIFIED WITH ACCOUNT" : d.state.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </section>

          <section style={CS.panel}>
            <div style={CS.panelHead}>
              <span style={CS.panelTitle}>Photos</span>
              <span style={{ font: "500 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: "#9AA2B0" }}>
                {c.photos.length} UPLOADED · 3 REQUIRED
              </span>
            </div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
              {c.photos.length === 0 && <div style={CS.panelSub}>No photos on file.</div>}
              {c.photos.map((p) => (
                <PhotoTile key={p.document_id} vehicleId={c.id} documentId={p.document_id} label={p.original_name} />
              ))}
            </div>
            {c.photos_checklist.items.length > 0 && (
              <div style={{ borderTop: "1px solid #F1F3F6" }}>
                <div style={CS.groupHead}>PHOTO CHECKS</div>
                {c.photos_checklist.items.map((it) => (
                  <ChecklistRow
                    key={it.id}
                    item={it}
                    busy={checklistMut.isPending}
                    onSet={(itemId, result, note) =>
                      checklistMut.mutate({ itemId, result, ...(note ? { note } : {}) })
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section style={CS.panel}>
            <div style={CS.panelHead}>
              <span style={CS.panelTitle}>Declared details</span>
              <span style={{ font: "400 12px/1.3 'Instrument Sans',sans-serif", color: "#838C9B" }}>Check against the logbook scan</span>
            </div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "16px 18px" }}>
              {[
                ["TYPE", c.type],
                ["YEAR", c.year],
                ["SEATS", String(c.seats)],
                ["TRANSMISSION", c.transmission],
                ["FUEL", c.fuel],
                ["COLOUR", c.colour ?? "—"],
                ["DRIVER", c.chauffeured ? "Included" : "Self-drive"],
                ["BASED IN", c.county ?? "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".09em", color: "#9AA2B0", marginBottom: 6 }}>{k}</div>
                  <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{v}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* right column */}
        <div style={{ flex: 1, minWidth: 280, display: "grid", gap: 16 }}>
          <section style={CS.panel}>
            <div style={CS.panelHead}>
              <span style={CS.panelTitle}>The merchant</span>
              <button type="button" onClick={() => navigate(`/merchants/${c.merchant.id}`)} style={CS.smallBtn}>
                Open file
              </button>
            </div>
            <div style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                <span style={CS.avatar}>{c.merchant.initials}</span>
                <div>
                  <div style={{ font: "600 14px/1.25 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{c.merchant.name}</div>
                  <div style={{ font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" }}>{c.merchant.contact_phone ?? "No phone on file"}</div>
                </div>
              </div>
              <div style={{ display: "grid", gap: 10, fontVariantNumeric: "tabular-nums" }}>
                {[
                  ["Account", c.merchant.approved ? "Verified" : "Documents pending", c.merchant.approved ? "#0B8A5B" : "#C77400"],
                  ["Merchant since", new Date(c.merchant.member_since).toLocaleDateString("en-GB", { month: "short", year: "numeric" }), "#1A1F2B"],
                  ["Live vehicles", String(c.merchant.live_vehicles), "#1A1F2B"],
                  ["Past rejections", String(c.merchant.prior_rejections), c.merchant.prior_rejections ? "#C77400" : "#1A1F2B"],
                ].map(([k, v, fg]) => (
                  <div key={k} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>{k}</span>
                    <span style={{ font: "600 13px/1.3 'Instrument Sans',sans-serif", color: fg, textAlign: "right" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            {c.reviewer_note && (
              <div style={{ padding: "13px 18px", background: "#FFF3DB", borderTop: "1px solid #F5D9A3", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#8A5200" }}>
                Note on file: {c.reviewer_note}
              </div>
            )}
          </section>

          <section style={{ ...CS.panel, padding: 18 }}>
            <div style={{ font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#9AA2B0", marginBottom: 16 }}>CASE ACTIVITY</div>
            {c.events.map((e, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "14px minmax(0,1fr)", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: TONE_DOT[e.tone], marginTop: 5, flex: "none" }} />
                  {i < c.events.length - 1 && <span style={{ flex: 1, width: 1, background: "#E4E7EC", minHeight: 8 }} />}
                </div>
                <div style={{ paddingBottom: 16 }}>
                  <div style={{ font: "600 13px/1.35 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{e.label}</div>
                  {e.body && <div style={{ font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", marginTop: 3 }}>{e.body}</div>}
                  <div style={{ font: "400 11px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".03em", color: "#838C9B", marginTop: 5 }}>
                    {new Date(e.occurred_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase()}
                    {e.actor_name ? ` · ${e.actor_name}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section style={CS.panel}>
            <div style={{ ...CS.panelHead, borderBottom: "1px solid #F1F3F6" }}>
              <span style={CS.panelTitle}>What the listing will say</span>
            </div>
            <div style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
              {[
                ["Daily rate", money(c.daily_rate?.amount)],
                ["Minimum hire", `${c.minimum_hire_days} ${c.minimum_hire_days === 1 ? "day" : "days"}`],
                ["Driver", c.chauffeured ? "Included" : "Self-drive"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ font: "400 13px/1.4 'Instrument Sans',sans-serif", color: "#5A6373" }}>{k}</span>
                  <span style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B", fontVariantNumeric: "tabular-nums" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={CS.panelFoot}>Rates are the merchant's to set. Flag only what breaks the rules.</div>
          </section>
        </div>
      </div>

      {modal?.kind === "approve" && (
        <ApproveModal
          registration={c.registration}
          county={c.county}
          rate={money(c.daily_rate?.amount)}
          busy={listingDecision.isPending}
          onClose={() => setModal(null)}
          onConfirm={(note) => listingDecision.mutate({ action: "approve", ...(note ? { note } : {}) })}
        />
      )}
      {(modal?.kind === "changes" || modal?.kind === "reject") && (
        <ReasonModal
          mode={modal.kind}
          registration={c.registration}
          busy={listingDecision.isPending}
          suggestedNote={modal.kind === "reject" ? c.checklist.suggested_note.reject : c.checklist.suggested_note.changes}
          onClose={() => setModal(null)}
          onConfirm={(note) =>
            listingDecision.mutate({ action: modal.kind === "reject" ? "reject" : "request_changes", note })
          }
        />
      )}
      {modal?.kind === "doc" && (
        <DocModal vehicleId={c.id} line={modal.line} onClose={() => setModal(null)} />
      )}

      {toast && (
        <div style={CS.toast}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: toast.dot, flex: "none" }} />
          <span style={{ font: "500 13px/1.35 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

// --- document row -------------------------------------------------

function DocRow({
  line,
  busy,
  checkBusy,
  onView,
  onAccept,
  onRejectWithNote,
  onSetCheck,
}: {
  line: DocLine;
  busy: boolean;
  checkBusy: boolean;
  onView: () => void;
  onAccept: () => void;
  onRejectWithNote: (note: string) => void;
  onSetCheck: (itemId: string, result: CheckResult, note?: string) => void;
}): JSX.Element {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const dot = DOC_DOT[line.state];
  const accepted = line.state === "ok";
  const rejected = line.state === "rejected";
  const cl = line.checklist;
  const hasChecklist = cl.items.length > 0;
  const clClear = hasChecklist && cl.blockers_outstanding === 0;
  // Open the checklist by default while there's still a blocker to work.
  const [checksOpen, setChecksOpen] = useState(hasChecklist && !clClear && !accepted);

  return (
    <div style={{ ...CS.docRow, background: rejected ? "#FDE7EA" : "#FFFFFF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: dot.core, flex: "none" }} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>
            {line.label}
            {line.scope === "account" && <span style={CS.accountTag}>ACCOUNT</span>}
          </div>
          <div style={{ font: "400 12px/1.45 'Instrument Sans',sans-serif", color: rejected ? "#D81E32" : accepted ? "#0B8A5B" : "#838C9B", marginTop: 2 }}>
            {rejected && line.review_note ? line.review_note : accepted && clClear ? "Accepted — checklist complete" : dot.label}
          </div>
        </div>
        <button type="button" onClick={onView} disabled={!line.document_id} style={{ ...CS.smallBtn, opacity: line.document_id ? 1 : 0.4 }}>
          Open scan
        </button>
        <div style={{ display: "flex", gap: 6, flex: "none" }}>
          <button
            type="button"
            disabled={busy || line.state === "missing"}
            onClick={onAccept}
            style={{ ...CS.smallBtn, background: accepted ? "#0B8A5B" : "#FFFFFF", color: accepted ? "#FFFFFF" : "#0B8A5B", borderColor: accepted ? "#0B8A5B" : "#A8DEC7" }}
          >
            Accept
          </button>
          <button
            type="button"
            disabled={busy || line.state === "missing"}
            onClick={() => setRejecting((v) => !v)}
            style={{ ...CS.smallBtn, background: rejected ? "#D81E32" : "#FFFFFF", color: rejected ? "#FFFFFF" : "#D81E32", borderColor: rejected ? "#D81E32" : "#F7BDC5" }}
          >
            Reject
          </button>
        </div>
      </div>

      {hasChecklist && (
        <>
          <button type="button" onClick={() => setChecksOpen((v) => !v)} style={CS.clToggle}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span style={{ color: "#9AA2B0" }}>{checksOpen ? "▾" : "▸"}</span>
              Checklist
            </span>
            <span
              style={{
                font: "500 11px/1.3 'IBM Plex Mono',monospace",
                letterSpacing: ".04em",
                color: cl.blockers_outstanding ? "#A50E22" : cl.flagged ? "#8A5200" : "#0B8A5B",
              }}
            >
              {cl.checked}/{cl.total}
              {cl.blockers_outstanding
                ? ` · ${cl.blockers_outstanding} MUST PASS`
                : cl.flagged
                  ? ` · ${cl.flagged} FLAGGED`
                  : " · ALL CLEAR"}
            </span>
          </button>
          {checksOpen && (
            <div style={CS.clBox}>
              {cl.items.map((it) => (
                <ChecklistRow key={it.id} item={it} busy={checkBusy} onSet={onSetCheck} />
              ))}
            </div>
          )}
        </>
      )}

      {rejecting && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What the merchant reads — quoted to them word for word."
            style={CS.textarea}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={CS.smallBtn} onClick={() => { setRejecting(false); setNote(""); }}>
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !note.trim()}
              style={{ ...CS.smallBtn, background: "#D81E32", color: "#fff", borderColor: "#D81E32" }}
              onClick={() => onRejectWithNote(note.trim())}
            >
              Send rejection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoTile({ vehicleId, documentId, label }: { vehicleId: string; documentId: string; label: string }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    documentObjectUrl(vehicleId, documentId)
      .then((u) => {
        made = u;
        if (live) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [vehicleId, documentId]);
  return (
    <div style={CS.photoTile} title={label}>
      {url ? (
        <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "var(--r)" }} />
      ) : (
        <span style={{ font: "500 10px/1.3 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: "#9AA2B0" }}>LOADING</span>
      )}
    </div>
  );
}

// --- modals -----------------------------------------------------

function Shell({ title, sub, width, children, footer, onClose }: { title: string; sub: string; width: number; children: ReactNode; footer: ReactNode; onClose: () => void }): JSX.Element {
  return (
    <div style={CS.overlay} onClick={onClose}>
      <div style={{ ...CS.modal, maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div style={CS.modalHead}>
          <div>
            <div style={{ font: "600 17px/1.25 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", color: "#1A1F2B" }}>{title}</div>
            <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", marginTop: 4, maxWidth: "52ch" }}>{sub}</div>
          </div>
          <button type="button" onClick={onClose} style={CS.modalX}>×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        <div style={CS.modalFoot}>{footer}</div>
      </div>
    </div>
  );
}

function ApproveModal({ registration, county, rate, busy, onConfirm, onClose }: { registration: string; county: string | null; rate: string; busy: boolean; onConfirm: (note?: string) => void; onClose: () => void }): JSX.Element {
  const [note, setNote] = useState("");
  return (
    <Shell
      title="Approve and publish"
      sub="The listing goes live in search and the merchant gets an SMS."
      width={540}
      onClose={onClose}
      footer={
        <>
          <button type="button" style={CS.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy} style={{ ...CS.ctaBtn, background: "#0B8A5B" }} onClick={() => onConfirm(note.trim() || undefined)}>
            Publish listing
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 15 }}>
        <div style={{ display: "grid", gap: 9 }}>
          {[
            "Every required document accepted, checked against the logbook name on the account.",
            `Listing goes live at ${rate} a day in ${county ?? "search"}.`,
          ].map((t) => (
            <div key={t} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: "#0B8A5B", marginTop: 6, flex: "none" }} />
              <div style={{ font: "400 13px/1.55 'Instrument Sans',sans-serif", color: "#333B4A" }}>{t}</div>
            </div>
          ))}
        </div>
        <label style={{ display: "block" }}>
          <span style={CS.fieldLabel}>Note for the merchant · optional</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything they should know now that it is live." style={CS.textarea} />
        </label>
        <div style={{ ...CS.hint, background: "#DDF3E9", border: "1px solid #A8DEC7", color: "#076945" }}>
          Publishing puts {registration} in search straight away and sends the merchant an SMS.
        </div>
      </div>
    </Shell>
  );
}

function ReasonModal({
  mode,
  registration,
  busy,
  suggestedNote,
  onConfirm,
  onClose,
}: {
  mode: "changes" | "reject";
  registration: string;
  busy: boolean;
  suggestedNote: string;
  onConfirm: (note: string) => void;
  onClose: () => void;
}): JSX.Element {
  const templates = mode === "reject" ? REASON_TEMPLATES.reject : REASON_TEMPLATES.changes;
  const [picked, setPicked] = useState<number>(suggestedNote ? -1 : 0);
  // Opens pre-filled from the checklist's flagged items; falls back to the
  // first canned template when nothing was flagged.
  const [note, setNote] = useState(suggestedNote || templates[0]![1]);
  return (
    <Shell
      title={mode === "reject" ? "Reject this submission" : "Request changes"}
      sub={mode === "reject" ? "A rejection closes the case. The merchant must start a fresh submission." : "The vehicle stays in the merchant's hands. Nothing is published and they can resubmit."}
      width={540}
      onClose={onClose}
      footer={
        <>
          <button type="button" style={CS.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            type="button"
            disabled={busy || !note.trim()}
            style={{ ...CS.ctaBtn, background: mode === "reject" ? "#D81E32" : "#0F23A8" }}
            onClick={() => onConfirm(note.trim())}
          >
            {mode === "reject" ? "Reject and close" : "Send to merchant"}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 15 }}>
        <div>
          <span style={CS.fieldLabel}>Reason</span>
          <div style={{ display: "grid", gap: 7 }}>
            {templates.map(([label, body], i) => {
              const on = picked === i;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setPicked(i); setNote(body); }}
                  style={{ ...CS.reasonBtn, borderColor: on ? "#0F23A8" : "#E4E7EC" }}
                >
                  <span style={{ ...CS.radio, borderColor: on ? "#0F23A8" : "#E4E7EC" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: on ? "#0F23A8" : "transparent", display: "block" }} />
                  </span>
                  <span style={{ flex: 1, font: "600 13px/1.4 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <label style={{ display: "block" }}>
          <span style={CS.fieldLabel}>What the merchant reads</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ ...CS.textarea, minHeight: 132 }} />
        </label>
        <div
          style={{
            ...CS.hint,
            background: mode === "reject" ? "#FDE7EA" : "#FFF3DB",
            border: `1px solid ${mode === "reject" ? "#F7BDC5" : "#F5D9A3"}`,
            color: mode === "reject" ? "#A50E22" : "#8A5200",
          }}
        >
          {mode === "reject"
            ? `Sent to ${registration}'s owner by SMS and email, and kept on the merchant file. Use rejection for ownership and fraud — not for a bad scan.`
            : "Sent by SMS and email. The case moves to Changes sent and comes back to you when they resubmit."}
        </div>
      </div>
    </Shell>
  );
}

function DocModal({ vehicleId, line, onClose }: { vehicleId: string; line: DocLine; onClose: () => void }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let made: string | null = null;
    if (!line.document_id) return;
    documentObjectUrl(vehicleId, line.document_id)
      .then((u) => { made = u; setUrl(u); })
      .catch(() => setFailed(true));
    return () => { if (made) URL.revokeObjectURL(made); };
  }, [vehicleId, line.document_id]);
  return (
    <Shell
      title={`${line.label} · document`}
      sub="What the merchant uploaded."
      width={640}
      onClose={onClose}
      footer={<button type="button" style={{ ...CS.ctaBtn, background: "#0F23A8" }} onClick={onClose}>Close</button>}
    >
      <div style={{ aspectRatio: "4/3", borderRadius: "var(--r)", border: "1px solid #E4E7EC", background: "#F1F3F6", display: "grid", placeItems: "center", overflow: "hidden" }}>
        {failed ? (
          <span style={{ font: "500 11px/1.5 'IBM Plex Mono',monospace", color: "#A50E22" }}>FILE NO LONGER STORED</span>
        ) : url ? (
          <iframe title={line.label} src={url} style={{ width: "100%", height: "100%", border: "none" }} />
        ) : (
          <span style={{ font: "500 11px/1.5 'IBM Plex Mono',monospace", color: "#838C9B" }}>LOADING…</span>
        )}
      </div>
      <div style={{ marginTop: 12, font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" }}>
        {line.original_name ?? "—"}
        {line.expires_at ? ` · expires ${line.expires_at}` : ""}
      </div>
    </Shell>
  );
}

const CS = {
  loading: { padding: 40, font: "400 13px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" },
  link: { background: "none", border: "none", padding: 0, color: "#0F23A8", cursor: "pointer", font: "600 13px/1 'Instrument Sans',sans-serif" },
  back: { display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px 0 8px", marginBottom: 14, background: "transparent", color: "#5A6373", border: "none", borderRadius: "var(--r-sm)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  card: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", padding: "clamp(18px,2.6vw,24px)", marginBottom: 16 },
  plateLg: { display: "inline-block", padding: "6px 12px", border: "1.5px solid #0B0F1A", borderRadius: "var(--r-sm)", font: "600 17px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".05em", color: "#1A1F2B", fontVariantNumeric: "tabular-nums" },
  statePill: { display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", border: "1px solid", borderRadius: 999, font: "600 13px/1.2 'Instrument Sans',sans-serif" },
  agePill: { display: "inline-block", padding: "6px 11px", borderRadius: 999, font: "600 12px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".04em" },
  h1: { margin: "0 0 6px", font: "600 clamp(24px,3.2vw,30px)/1.1 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.022em", color: "#1A1F2B" },
  subline: { font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  kicker: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#9AA2B0", marginBottom: 6 },
  refChip: { display: "inline-block", padding: "5px 10px", background: "#F1F3F6", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "500 12px/1.2 'IBM Plex Mono',monospace", color: "#333B4A", marginBottom: 9 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18, paddingTop: 18, borderTop: "1px solid #F1F3F6" },
  actBtn: { height: 40, padding: "0 17px", border: "none", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px", borderBottom: "1px solid #F1F3F6", flexWrap: "wrap" },
  panelTitle: { font: "600 15px/1.2 Archivo,sans-serif", color: "#1A1F2B" },
  panelSub: { font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 3 },
  panelFoot: { padding: "12px 18px", background: "#FFFFFF", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  docRow: { padding: "14px 18px", borderBottom: "1px solid #F1F3F6" },
  accountTag: { marginLeft: 8, padding: "2px 6px", background: "#F1F3F6", borderRadius: "var(--r-sm)", font: "500 9px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: "#5A6373", verticalAlign: "middle" },
  smallBtn: { height: 32, padding: "0 12px", background: "#FFFFFF", color: "#0F23A8", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  groupHead: { padding: "9px 18px", background: "#FAFBFC", borderBottom: "1px solid #F1F3F6", font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".1em", color: "#9AA2B0" },
  clToggle: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", marginTop: 12, padding: "9px 12px", background: "#FAFBFC", border: "1px solid #EEF0F3", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", color: "#5A6373", cursor: "pointer" },
  clBox: { marginTop: 8, border: "1px solid #EEF0F3", borderRadius: "var(--r)", overflow: "hidden" },
  photoTile: { aspectRatio: "4/3", borderRadius: "var(--r)", border: "1px solid #E4E7EC", background: "#F1F3F6", display: "grid", placeItems: "center", overflow: "hidden" },
  avatar: { width: 36, height: 36, borderRadius: 999, background: "#F1F3F6", color: "#0F23A8", font: "600 12px/36px 'IBM Plex Mono',monospace", textAlign: "center", flex: "none" },
  overlay: { position: "fixed", inset: 0, background: "rgba(11,15,26,.44)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 },
  modal: { width: "100%", background: "#FFFFFF", borderRadius: "var(--r-lg)", boxShadow: "0 24px 60px rgba(11,15,26,.28)", maxHeight: "88vh", overflowY: "auto" },
  modalHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, padding: "18px 20px", borderBottom: "1px solid #F1F3F6" },
  modalX: { width: 30, height: 30, background: "#F1F3F6", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", color: "#5A6373", font: "400 15px/1 'Instrument Sans',sans-serif", cursor: "pointer", flex: "none" },
  modalFoot: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "16px 20px", borderTop: "1px solid #F1F3F6", flexWrap: "wrap" },
  cancelBtn: { height: 42, padding: "0 16px", background: "transparent", color: "#5A6373", border: "1px solid transparent", borderRadius: "var(--r)", font: "600 14px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  ctaBtn: { height: 42, padding: "0 20px", color: "#FFFFFF", border: "none", borderRadius: "var(--r)", font: "600 14px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  fieldLabel: { display: "block", font: "600 13px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B", marginBottom: 7 },
  textarea: { width: "100%", minHeight: 84, padding: 13, border: "1.5px solid #E4E7EC", borderRadius: "var(--r)", font: "400 14px/1.55 'Instrument Sans',sans-serif", color: "#1A1F2B", background: "#FFFFFF", resize: "vertical" },
  hint: { padding: "13px 15px", borderRadius: "var(--r)", font: "400 13px/1.55 'Instrument Sans',sans-serif" },
  reasonBtn: { display: "flex", alignItems: "flex-start", gap: 11, padding: "12px 14px", background: "#F1F3F6", border: "1.5px solid", borderRadius: "var(--r)", cursor: "pointer", textAlign: "left" },
  radio: { width: 16, height: 16, borderRadius: 999, border: "1.5px solid", background: "#FFFFFF", flex: "none", marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center" },
  toast: { position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 11, padding: "13px 18px", background: "#F1F3F6", borderRadius: 999, boxShadow: "0 12px 32px rgba(11,15,26,.3)", zIndex: 70, maxWidth: "calc(100vw - 32px)" },
} satisfies Record<string, CSSProperties>;

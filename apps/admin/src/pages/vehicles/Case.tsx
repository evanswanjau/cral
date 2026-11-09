import { useEffect, useState, type CSSProperties } from "react";
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
  type DocDecision,
  type ReviewCase,
} from "../../lib/vehicles-api.js";
import { ApiClientError } from "../../lib/api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import { ageBadge, entityWord, money, READY_TONE, REASON_TEMPLATES, statusTone } from "../../components/console/status.js";
import { ActivityPanel } from "../../components/console/review/Activity.js";
import { ReviewSection } from "../../components/console/review/ReviewSection.js";
import { DecisionDock, NextStep, ProgressStrip, Toast } from "../../components/console/review/Progress.js";
import { ApproveModal, ReasonModal, ScanViewer, UploadRequestModal } from "../../components/console/review/modals.js";
import { scrollToSection, sectionOpen, type SectionModel } from "../../components/console/review/model.js";
import { RS, TONE_BTN } from "../../components/console/review/styles.js";

type Modal =
  | { kind: "approve" }
  | { kind: "changes" }
  | { kind: "reject" }
  | { kind: "upload"; key: string }
  | { kind: "scan"; key: string }
  | null;

type ListingAction = "approve" | "request_changes" | "reject";

/**
 * The vehicle review case, checklist-first (owner's call, 2026-09-25):
 * work every document's checklist - each one accepts itself when every
 * line passes - and only then do Approve / Request changes / Reject
 * appear, in the dock at the foot of the screen. The business is a
 * separate gate; the dock sends the reviewer to the merchant file when it
 * isn't verified yet, and the file sends them back.
 */
export function Case(): JSX.Element {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ text: string; dot: string } | null>(null);
  const [justDecided, setJustDecided] = useState<ListingAction | null>(null);
  const [redeciding, setRedeciding] = useState(false);

  useEffect(() => {
    setJustDecided(null);
    setRedeciding(false);
    setModal(null);
  }, [vehicleId]);

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
  const failed = (e: unknown, fallback = "That didn't work.") =>
    flash(e instanceof ApiClientError ? e.message : fallback, "#D81E32");
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
    mutationFn: (v: { kind: string; decision: DocDecision; note?: string }) =>
      decideDocument(vehicleId!, v.kind, v.decision, v.note),
    onSuccess: (next, v) => {
      onCase(next);
      setModal(null);
      if (v.decision === "accept") flash("Document accepted.");
      else if (v.decision === "reject") flash("New upload requested - the merchant has been told.", "#C77400");
      else if (v.decision === "reset") flash("Decision undone. Work the checklist again.", "#838C9B");
    },
    onError: (e) => failed(e),
  });
  const checklistMut = useMutation({
    mutationFn: (v: { itemId: string; result: CheckResult; note?: string }) =>
      setChecklistItem(vehicleId!, v.itemId, v.result, v.note),
    onSuccess: onCase,
    onError: (e) => failed(e, "That didn't save."),
  });
  const listingDecision = useMutation({
    mutationFn: (v: { action: ListingAction; note?: string }) => decideListing(vehicleId!, v.action, v.note),
    onSuccess: (next, v) => {
      onCase(next);
      setModal(null);
      setRedeciding(false);
      setJustDecided(v.action);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e) => failed(e),
  });

  if (isLoading) return <div style={RS.loading}>Loading the case…</div>;
  if (error || !c) {
    return (
      <div style={RS.loading}>
        Couldn't load that case.{" "}
        <button type="button" style={RS.link} onClick={() => navigate("/vehicles")}>
          Back to the queue
        </button>
      </div>
    );
  }

  const sections: SectionModel[] = [
    ...c.documents.map((d) => ({
      key: d.kind,
      label: d.label,
      doc: {
        state: d.state,
        document_id: d.document_id,
        review_note: d.review_note,
        original_name: d.original_name,
        expires_at: d.expires_at,
      },
      checklist: d.checklist,
    })),
    {
      key: "photos",
      label: "Photos",
      hint: `${c.photos.length} uploaded · 3 required`,
      doc: null,
      checklist: c.photos_checklist,
    },
  ];
  const sectionByKey = (key: string) => sections.find((s) => s.key === key)!;
  const savingItemId = checklistMut.isPending ? (checklistMut.variables?.itemId ?? null) : null;
  const setCheck = (itemId: string, result: CheckResult, note?: string) =>
    checklistMut.mutate({ itemId, result, ...(note ? { note } : {}) });

  /** When a section finishes: say what happened and move to the next open one. */
  const onSectionComplete = (key: string) => {
    const s = sectionByKey(key);
    const idx = sections.findIndex((x) => x.key === key);
    const next = [...sections.slice(idx + 1), ...sections.slice(0, idx)].find(sectionOpen);
    flash(
      s.checklist.flagged
        ? `${s.label}: ${s.checklist.flagged} flagged - it'll go in the request-changes note.`
        : s.doc
          ? `${s.label} accepted - checklist complete.`
          : `${s.label} checked.`,
      s.checklist.flagged ? "#C77400" : "#0B8A5B",
    );
    if (next) window.setTimeout(() => scrollToSection(next.key), 250);
  };

  // "Needs review" / "With you" describe the queue, not the work: once every
  // check is answered and nothing is decided yet, say so.
  const tone =
    c.can_decide && (c.status === "pending" || c.status === "review") ? READY_TONE : statusTone(c.status);
  // A company has a "business"; an individual renting out their own car has an "account".
  const entity = entityWord(c.merchant.owner_type);
  const age = ageBadge(c.waiting_hours, c.sla_days);
  const decided = (c.status === "live" || c.status === "rejected" || c.status === "action") && !redeciding;
  const merchantFileHref = `/merchants/${c.merchant.id}?from=${c.id}`;
  const b = c.approve_blockers;

  // --- the dock -------------------------------------------------------
  const btn = (style: CSSProperties) => ({ ...RS.actBtn, ...style });
  const changesBtn = (solid: boolean) => (
    <button type="button" onClick={() => setModal({ kind: "changes" })} style={btn(solid ? TONE_BTN.changesSolid : TONE_BTN.changes)}>
      Request changes
    </button>
  );
  const rejectBtn = (
    <button type="button" onClick={() => setModal({ kind: "reject" })} style={btn(TONE_BTN.reject)}>
      Reject
    </button>
  );
  let notice: JSX.Element | undefined;
  let actions: JSX.Element;
  if (c.can_approve) {
    actions = (
      <>
        {rejectBtn}
        {changesBtn(false)}
        <button type="button" onClick={() => setModal({ kind: "approve" })} style={btn(TONE_BTN.approve)}>
          Approve &amp; publish
        </button>
      </>
    );
  } else if (b.flagged > 0) {
    notice = (
      <>
        <strong>{b.flagged} flagged check{b.flagged === 1 ? "" : "s"}.</strong> A flagged listing can't go live - send the
        merchant what to fix. The note is already written from your flags.
      </>
    );
    actions = (
      <>
        {rejectBtn}
        {changesBtn(true)}
      </>
    );
  } else if (b.merchant_not_approved) {
    notice = (
      <>
        <strong>The car checks out, but {c.merchant.name} isn't verified yet.</strong> A car can only go live once the
        merchant's {entity} is approved - review it, and you'll be brought back here to publish.
      </>
    );
    actions = (
      <>
        {rejectBtn}
        {changesBtn(false)}
        <button type="button" onClick={() => navigate(merchantFileHref)} style={btn(TONE_BTN.primary)}>
          Review the {entity} →
        </button>
      </>
    );
  } else {
    notice = (
      <>
        <strong>
          {b.documents} document{b.documents === 1 ? " isn't" : "s aren't"} accepted.
        </strong>{" "}
        A document that's missing, sent back or about to expire has to be replaced before this can go live.
      </>
    );
    actions = (
      <>
        {rejectBtn}
        {changesBtn(true)}
      </>
    );
  }

  const outcome = decided ? (
    <div>
      <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>
        {c.status === "live"
          ? `${c.registration} is live.`
          : c.status === "rejected"
            ? `${c.registration} was rejected.`
            : `Changes sent - waiting on ${c.merchant.name}.`}
      </div>
      <div style={{ font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 3 }}>
        {c.status === "action"
          ? "The case comes back to the queue when they resubmit."
          : "The merchant has been told."}
      </div>
    </div>
  ) : undefined;
  const outcomeActions = (
    <>
      <button type="button" onClick={() => setRedeciding(true)} style={btn(TONE_BTN.quiet)}>
        Change decision
      </button>
      {c.next_case && (
        <button type="button" onClick={() => navigate(`/vehicles/${c.next_case!.id}`)} style={btn(TONE_BTN.primary)}>
          Next case · {c.next_case.registration} →
        </button>
      )}
    </>
  );

  const scanSection = modal?.kind === "scan" ? sectionByKey(modal.key) : null;
  const docSections = sections.filter((s) => s.doc);
  const scanNext = scanSection
    ? docSections[docSections.findIndex((s) => s.key === scanSection.key) + 1]
    : undefined;

  return (
    <div>
      <button type="button" onClick={() => navigate("/vehicles")} style={RS.back}>
        ‹ Back to vehicle review
      </button>

      {justDecided && (
        <NextStep
          tone={justDecided === "approve" ? "green" : "amber"}
          title={
            justDecided === "approve"
              ? `${c.registration} is live. The merchant has been told.`
              : justDecided === "request_changes"
                ? `Changes sent to ${c.merchant.name}.`
                : `${c.registration} rejected and closed.`
          }
          body={
            c.merchant_next_case
              ? `${c.merchant.name} has another car waiting: ${c.merchant_next_case.registration}.`
              : c.next_case
                ? "On to the next one in the queue."
                : "The queue is clear."
          }
          actions={
            <>
              {c.merchant_next_case && (
                <button type="button" onClick={() => navigate(`/vehicles/${c.merchant_next_case!.id}`)} style={btn(TONE_BTN.quiet)}>
                  Review {c.merchant_next_case.registration}
                </button>
              )}
              {c.next_case && (
                <button type="button" onClick={() => navigate(`/vehicles/${c.next_case!.id}`)} style={btn(TONE_BTN.primary)}>
                  Next in queue · {c.next_case.registration} →
                </button>
              )}
              {!c.next_case && (
                <button type="button" onClick={() => navigate("/vehicles")} style={btn(TONE_BTN.primary)}>
                  Back to the queue
                </button>
              )}
            </>
          }
        />
      )}

      {/* header */}
      <div style={RS.card}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap", marginBottom: 9 }}>
              <span style={S.plateLg}>{c.registration}</span>
              <span style={{ ...RS.statePill, background: tone.tint, borderColor: tone.border, color: tone.text }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: tone.core }} />
                {tone.label}
              </span>
              {/* Waiting time only means something while the case is open. */}
              {(c.status === "pending" || c.status === "review") && (
                <span style={{ ...S.agePill, background: age.bg, color: age.fg }}>{age.long}</span>
              )}
            </div>
            <h1 style={RS.h1}>{c.title}</h1>
            <div style={RS.subline}>
              {c.type} · {c.year} · {c.transmission} · {c.seats} seats · {c.county ?? "—"}
              {c.pickup_address ? ` · ${c.pickup_address}` : ""}
            </div>
          </div>
          <div style={{ display: "grid", justifyItems: "end", gap: 8, marginLeft: "auto", flex: "none" }}>
            <div style={{ textAlign: "right" }}>
              <div style={RS.kicker}>LISTING REF</div>
              <div style={S.refChip}>{c.listing_ref ?? "—"}</div>
            </div>
            <div style={{ ...RS.mono, color: "#838C9B", fontWeight: 400 }}>
              SUBMITTED {new Date(c.submitted_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
            </div>
            <button
              type="button"
              onClick={() => (c.assigned_to_me ? flash("Already yours.", "#838C9B") : assign.mutate())}
              disabled={assign.isPending}
              style={{ ...RS.smallBtn, color: c.assigned_to_me ? "#9AA2B0" : "#0F23A8" }}
            >
              {c.assigned_to_me ? "Assigned to you" : "Assign to me"}
            </button>
          </div>
        </div>
        <ProgressStrip sections={sections} />
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* left column: the work */}
        <div style={{ flex: 1.55, minWidth: "min(100%, 320px)", display: "grid", gap: 16 }}>
          {sections.map((s) =>
            s.doc ? (
              <ReviewSection
                key={s.key}
                section={s}
                savingItemId={savingItemId}
                docBusy={docDecision.isPending}
                onSetCheck={setCheck}
                onOpenScan={() => setModal({ kind: "scan", key: s.key })}
                onRequestUpload={() => setModal({ kind: "upload", key: s.key })}
                onUndo={() => docDecision.mutate({ kind: s.key, decision: "reset" })}
                onAccept={() => docDecision.mutate({ kind: s.key, decision: "accept" })}
                onComplete={() => onSectionComplete(s.key)}
              />
            ) : (
              <ReviewSection
                key={s.key}
                section={s}
                savingItemId={savingItemId}
                onSetCheck={setCheck}
                onComplete={() => onSectionComplete(s.key)}
              >
                <div style={{ padding: "0 18px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 8 }}>
                  {c.photos.length === 0 && <div style={RS.panelSub}>No photos on file.</div>}
                  {c.photos.map((p) => (
                    <PhotoTile key={p.document_id} vehicleId={c.id} documentId={p.document_id} label={p.original_name} />
                  ))}
                </div>
              </ReviewSection>
            ),
          )}

          <section style={RS.panel}>
            <div style={RS.panelHead}>
              <span style={RS.panelTitle}>Declared details</span>
              <span style={{ font: "400 12px/1.3 'Instrument Sans',sans-serif", color: "#838C9B" }}>Check against the logbook scan</span>
            </div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "16px 18px" }}>
              {[
                ["REGISTRATION", c.registration],
                ["MAKE & MODEL", c.title],
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
                  <div style={{ ...RS.kicker, marginBottom: 6 }}>{k}</div>
                  <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B", overflowWrap: "anywhere" }}>{v}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* right column: context */}
        <div style={{ flex: 1, minWidth: "min(100%, 280px)", display: "grid", gap: 16 }}>
          <section style={RS.panel}>
            <div style={RS.panelHead}>
              <span style={RS.panelTitle}>The merchant</span>
              <button type="button" onClick={() => navigate(merchantFileHref)} style={RS.smallBtn}>
                Open file
              </button>
            </div>
            <div style={{ padding: "16px 18px", display: "grid", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span style={RS.avatar}>{c.merchant.initials}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: "600 14px/1.25 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{c.merchant.name}</div>
                  <div style={{ font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" }}>{c.merchant.contact_phone ?? "No phone on file"}</div>
                </div>
              </div>
              <div
                style={{
                  ...RS.hint,
                  padding: "10px 12px",
                  background: c.merchant_approved ? "#DDF3E9" : "#FFF3DB",
                  border: `1px solid ${c.merchant_approved ? "#A8DEC7" : "#F5D9A3"}`,
                  color: c.merchant_approved ? "#076945" : "#8A5200",
                  fontSize: 12,
                }}
              >
                <strong>
                  {c.merchant_approved
                    ? `✓ ${entity === "business" ? "Business" : "Account"} verified`
                    : `! ${entity === "business" ? "Business" : "Account"} not verified yet`}
                </strong>
                <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                  {c.account_documents.map((d) => (
                    <div key={d.kind} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>{d.label}</span>
                      <span style={RS.mono}>{d.verified_with_account || d.state === "ok" ? "✓ OK" : d.state.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gap: 10, fontVariantNumeric: "tabular-nums" }}>
                {[
                  ["Merchant since", new Date(c.merchant.member_since).toLocaleDateString("en-GB", { month: "short", year: "numeric" }), "#1A1F2B"],
                  ["Live vehicles", String(c.merchant.live_vehicles), "#1A1F2B"],
                  ["Past rejections", String(c.merchant.prior_rejections), c.merchant.prior_rejections ? "#C77400" : "#1A1F2B"],
                ].map(([k, v, fg]) => (
                  <div key={k} style={RS.kv}>
                    <span style={RS.kvKey}>{k}</span>
                    <span style={{ ...RS.kvVal, color: fg }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            {c.reviewer_note && (
              <div style={{ padding: "13px 18px", background: "#FFF3DB", borderTop: "1px solid #F5D9A3", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#8A5200", whiteSpace: "pre-wrap" }}>
                Note on file: {c.reviewer_note}
              </div>
            )}
          </section>

          <section style={RS.panel}>
            <div style={RS.panelHead}>
              <span style={RS.panelTitle}>What the listing will say</span>
            </div>
            <div style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
              {[
                ["Daily rate", money(c.daily_rate?.amount)],
                ["Minimum hire", `${c.minimum_hire_days} ${c.minimum_hire_days === 1 ? "day" : "days"}`],
                ["Driver", c.chauffeured ? "Included" : "Self-drive"],
              ].map(([k, v]) => (
                <div key={k} style={RS.kv}>
                  <span style={RS.kvKey}>{k}</span>
                  <span style={{ ...RS.kvVal, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={RS.panelFoot}>Rates are the merchant's to set. Flag only what breaks the rules.</div>
          </section>

          <ActivityPanel events={c.events} />
        </div>
      </div>

      <DecisionDock
        sections={sections}
        canDecide={c.can_decide}
        notice={decided ? undefined : notice}
        actions={decided ? outcomeActions : actions}
        outcome={outcome}
      />

      {modal?.kind === "approve" && (
        <ApproveModal
          title={`Publish ${c.registration}`}
          sub="The listing goes live in search and the merchant is told by SMS."
          points={[
            `Every check on every document passed, and the merchant's ${entity} is verified.`,
            `Goes live at ${money(c.daily_rate?.amount)} a day in ${c.county ?? "search"}.`,
          ]}
          cta="Publish listing"
          withNote
          busy={listingDecision.isPending}
          onClose={() => setModal(null)}
          onConfirm={(note) => listingDecision.mutate({ action: "approve", ...(note ? { note } : {}) })}
        />
      )}
      {(modal?.kind === "changes" || modal?.kind === "reject") && (
        <ReasonModal
          mode={modal.kind}
          subject={c.registration}
          suggestedNote={modal.kind === "reject" ? c.checklist.suggested_note.reject : c.checklist.suggested_note.changes}
          templates={modal.kind === "reject" ? REASON_TEMPLATES.reject : REASON_TEMPLATES.changes}
          hint={
            modal.kind === "reject"
              ? "Sent by SMS and email, and kept on the merchant file. Use rejection for ownership and fraud - not for a bad scan."
              : "Sent by SMS and email. The case moves to Changes sent and comes back to you when they resubmit."
          }
          busy={listingDecision.isPending}
          onClose={() => setModal(null)}
          onConfirm={(note) =>
            listingDecision.mutate({ action: modal.kind === "reject" ? "reject" : "request_changes", note })
          }
        />
      )}
      {modal?.kind === "upload" && (
        <UploadRequestModal
          docLabel={sectionByKey(modal.key).label}
          flaggedNote={sectionByKey(modal.key)
            .checklist.items.filter((i) => i.result === "flag")
            .map((i) => i.note ?? i.label)
            .join(" ")}
          busy={docDecision.isPending}
          onClose={() => setModal(null)}
          onConfirm={(note) => docDecision.mutate({ kind: modal.key, decision: "reject", note })}
        />
      )}
      {scanSection && (
        <ScanViewer
          section={scanSection}
          loadUrl={() =>
            scanSection.doc?.document_id
              ? documentObjectUrl(c.id, scanSection.doc.document_id)
              : Promise.reject(new Error("no document"))
          }
          savingItemId={savingItemId}
          onSetCheck={setCheck}
          onAccept={() => docDecision.mutate({ kind: scanSection.key, decision: "accept" })}
          onNext={scanNext ? () => setModal({ kind: "scan", key: scanNext.key }) : undefined}
          nextLabel={scanNext ? scanNext.label : undefined}
          onClose={() => setModal(null)}
        />
      )}

      <Toast toast={toast} />
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
    <a href={url ?? undefined} target="_blank" rel="noreferrer" style={S.photoTile} title={label}>
      {url ? (
        <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "var(--r)" }} />
      ) : (
        <span style={{ ...RS.mono, fontSize: 10, color: "#9AA2B0" }}>LOADING</span>
      )}
    </a>
  );
}

const S = {
  plateLg: { display: "inline-block", padding: "6px 12px", border: "1.5px solid #0B0F1A", borderRadius: "var(--r-sm)", font: "600 17px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".05em", color: "#1A1F2B", fontVariantNumeric: "tabular-nums" },
  agePill: { display: "inline-block", padding: "6px 11px", borderRadius: 999, font: "600 12px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".04em" },
  refChip: { display: "inline-block", padding: "5px 10px", background: "#F1F3F6", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "500 12px/1.2 'IBM Plex Mono',monospace", color: "#333B4A" },
  photoTile: { aspectRatio: "4/3", borderRadius: "var(--r)", border: "1px solid #E4E7EC", background: "#F1F3F6", display: "grid", placeItems: "center", overflow: "hidden" },
} satisfies Record<string, CSSProperties>;

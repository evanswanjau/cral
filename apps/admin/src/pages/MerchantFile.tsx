import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveMerchant,
  businessDocObjectUrl,
  decideBusinessDocument,
  fetchMerchantFile,
  reopenMerchantReview,
  requestMerchantChanges,
  setMerchantChecklistItem,
  type MerchantFile as MerchantFileT,
  type MerchantFleetRow,
} from "../lib/merchants-api.js";
import type { CheckResult, DocDecision } from "../lib/vehicles-api.js";
import { ApiClientError } from "../lib/api.js";
import { usePageTitle } from "../lib/use-page-title.js";
import { DRIVER_STATUS } from "./drivers/Queue.js";
import { entityWord, MERCHANT_BADGE, money, statusTone } from "../components/console/status.js";
import { ReviewSection } from "../components/console/review/ReviewSection.js";
import { DecisionDock, NextStep, ProgressStrip, Toast } from "../components/console/review/Progress.js";
import { ApproveModal, ReasonModal, ScanViewer, UploadRequestModal } from "../components/console/review/modals.js";
import { scrollToSection, sectionOpen, type SectionModel } from "../components/console/review/model.js";
import { RS, TONE_BTN } from "../components/console/review/styles.js";
import { ActivityPanel } from "../components/console/review/Activity.js";

type Modal =
  | { kind: "approve" }
  | { kind: "changes" }
  | { kind: "upload"; key: string }
  | { kind: "scan"; key: string }
  | null;

/**
 * The merchant file - the business gate, laid out like the vehicle case
 * (owner's call, 2026-09-25): each business document with its checklist
 * underneath, the account-wide checks as their own section, the declared
 * details beside the scans, and the decisions in the dock once every
 * check is answered. There is a business-level Request changes but no
 * business Reject - that's account suspension, its own slice.
 *
 * Arriving from a vehicle case (`?from=<vehicleId>`) keeps the way back:
 * once the business is approved the banner offers to return and publish.
 */
export function MerchantFile(): JSX.Element {
  const { merchantId } = useParams<{ merchantId: string }>();
  const [params] = useSearchParams();
  const fromVehicle = params.get("from");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ text: string; dot: string } | null>(null);
  const [justApproved, setJustApproved] = useState(false);
  const [redeciding, setRedeciding] = useState(false);
  useEffect(() => {
    setJustApproved(false);
    setRedeciding(false);
    setModal(null);
  }, [merchantId]);

  const flash = (text: string, dot = "#0B8A5B") => {
    setToast({ text, dot });
    window.setTimeout(() => setToast(null), 3600);
  };
  const failed = (e: unknown, fallback = "That didn't work.") =>
    flash(e instanceof ApiClientError ? e.message : fallback, "#D81E32");

  const { data: m, isLoading, error } = useQuery({
    queryKey: ["admin", "merchants", "file", merchantId],
    queryFn: () => fetchMerchantFile(merchantId!),
    enabled: !!merchantId,
  });
  usePageTitle(m ? m.name : "Merchant");

  const onFile = (next: MerchantFileT) => {
    qc.setQueryData(["admin", "merchants", "file", merchantId], next);
    void qc.invalidateQueries({ queryKey: ["admin", "merchants", "list"] });
    // A vehicle case reads the business's approval - keep it fresh.
    void qc.invalidateQueries({ queryKey: ["admin", "vehicles", "case"] });
  };
  const docMut = useMutation({
    mutationFn: (v: { kind: string; decision: DocDecision; note?: string }) =>
      decideBusinessDocument(merchantId!, v.kind, v.decision, v.note),
    onSuccess: (next, v) => {
      onFile(next);
      setModal(null);
      if (v.decision === "accept") flash("Document accepted.");
      else if (v.decision === "reject") flash("New upload requested - the merchant has been told.", "#C77400");
      else if (v.decision === "reset") flash("Decision undone. Work the checklist again.", "#838C9B");
    },
    onError: (e) => failed(e),
  });
  const checkMut = useMutation({
    mutationFn: (v: { itemId: string; result: CheckResult; note?: string }) =>
      setMerchantChecklistItem(merchantId!, v.itemId, v.result, v.note),
    onSuccess: onFile,
    onError: (e) => failed(e, "That didn't save."),
  });
  const approveMut = useMutation({
    mutationFn: () => approveMerchant(merchantId!),
    onSuccess: (next) => {
      onFile(next);
      setModal(null);
      setRedeciding(false);
      setJustApproved(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e) => failed(e),
  });
  const changesMut = useMutation({
    mutationFn: (note: string) => requestMerchantChanges(merchantId!, note),
    onSuccess: (next) => {
      onFile(next);
      setModal(null);
      flash(`Sent to ${next.name}. The file reads Changes sent until you approve.`, "#C77400");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e) => failed(e),
  });
  const reopenMut = useMutation({
    mutationFn: () => reopenMerchantReview(merchantId!),
    onSuccess: (next) => {
      onFile(next);
      setRedeciding(false);
      flash(`${next.name}'s approval reopened.`, "#C77400");
    },
    onError: (e) => failed(e),
  });

  if (isLoading) return <div style={RS.loading}>Loading the file…</div>;
  if (error || !m) {
    return (
      <div style={RS.loading}>
        Couldn't load that merchant.{" "}
        <button type="button" style={RS.link} onClick={() => navigate("/merchants")}>
          All merchants
        </button>
      </div>
    );
  }

  // A company has a "business"; an individual renting out their own car has an "account".
  const entity = entityWord(m.owner_type);
  const sections: SectionModel[] = [
    ...m.business_documents.map((d) => ({
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
    ...(m.business_checklist.items.length
      ? [
          {
            key: "business",
            label: entity === "business" ? "The business as a whole" : "Consistency and payout",
            hint:
              entity === "business"
                ? "Address, consistency across documents, payout name - compare with the declared details."
                : "The documents agree on who this is, none look edited, and the payout name is theirs.",
            doc: null,
            checklist: m.business_checklist,
          },
        ]
      : []),
  ];
  const sectionByKey = (key: string) => sections.find((s) => s.key === key)!;
  const savingItemId = checkMut.isPending ? (checkMut.variables?.itemId ?? null) : null;
  const setCheck = (itemId: string, result: CheckResult, note?: string) =>
    checkMut.mutate({ itemId, result, ...(note ? { note } : {}) });
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

  // Every check answered and nothing decided: say it's waiting on a decision.
  const badge = MERCHANT_BADGE[m.badge === "new_merchant" && m.can_decide ? "ready" : m.badge];
  const b = m.approve_blockers;
  const decided = m.approved && !redeciding;
  const fromCar = fromVehicle ? m.fleet.find((v) => v.id === fromVehicle) : undefined;
  const btn = (style: CSSProperties) => ({ ...RS.actBtn, ...style });
  const waitingCars = m.stats.waiting;

  // --- the dock -------------------------------------------------------
  const changesBtn = (solid: boolean) => (
    <button type="button" onClick={() => setModal({ kind: "changes" })} style={btn(solid ? TONE_BTN.changesSolid : TONE_BTN.changes)}>
      Request changes
    </button>
  );
  let notice: JSX.Element | undefined;
  let actions: JSX.Element;
  if (m.can_approve) {
    actions = (
      <>
        {changesBtn(false)}
        <button type="button" onClick={() => setModal({ kind: "approve" })} style={btn(TONE_BTN.approve)}>
          Approve {entity}
        </button>
      </>
    );
  } else if (b.flagged > 0) {
    notice = (
      <>
        <strong>{b.flagged} flagged check{b.flagged === 1 ? "" : "s"}.</strong> The {entity} can't be verified as it
        stands - send {m.name} what to fix. The note is already written from your flags.
      </>
    );
    actions = changesBtn(true);
  } else {
    notice = (
      <>
        <strong>
          {b.documents} document{b.documents === 1 ? " isn't" : "s aren't"} accepted.
        </strong>{" "}
        A document that's missing, sent back or about to expire has to be replaced first.
      </>
    );
    actions = changesBtn(true);
  }
  const outcome = decided ? (
    <div>
      <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#076945" }}>
        ✓ Verified
        {m.approved_at
          ? ` on ${new Date(m.approved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
          : ""}
      </div>
      <div style={{ font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 3 }}>
        New cars from {m.name} only need their own documents checked.
      </div>
    </div>
  ) : undefined;
  const outcomeActions = (
    <>
      <button type="button" disabled={reopenMut.isPending} onClick={() => reopenMut.mutate()} style={btn(TONE_BTN.changes)}>
        Reopen review
      </button>
      {m.review_next && (
        <button type="button" onClick={() => navigate(`/vehicles/${m.review_next!.id}`)} style={btn(TONE_BTN.primary)}>
          Review {m.review_next.registration} →
        </button>
      )}
    </>
  );

  const scanSection = modal?.kind === "scan" ? sectionByKey(modal.key) : null;
  const docSections = sections.filter((s) => s.doc);
  const scanNext = scanSection ? docSections[docSections.findIndex((s) => s.key === scanSection.key) + 1] : undefined;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => navigate(fromVehicle ? `/vehicles/${fromVehicle}` : "/merchants")}
          style={RS.back}
        >
          ‹ {fromCar ? `Back to ${fromCar.registration}` : "All merchants"}
        </button>
      </div>

      {/* The other gate: where the reviewer came from, or where to go next. */}
      {m.approved && (justApproved || fromCar) ? (
        <NextStep
          tone="green"
          title={`${m.name} is verified.`}
          body={
            fromCar
              ? `${fromCar.registration} can be published now - head back and approve it.`
              : waitingCars
                ? `${waitingCars} car${waitingCars === 1 ? " is" : "s are"} waiting on us from this merchant.`
                : "Nothing else from this merchant is waiting on us."
          }
          actions={
            fromCar ? (
              <button type="button" onClick={() => navigate(`/vehicles/${fromCar.id}`)} style={btn(TONE_BTN.approve)}>
                Back to {fromCar.registration} →
              </button>
            ) : m.review_next ? (
              <button type="button" onClick={() => navigate(`/vehicles/${m.review_next!.id}`)} style={btn(TONE_BTN.primary)}>
                Review {m.review_next.registration} →
              </button>
            ) : (
              <button type="button" onClick={() => navigate("/merchants")} style={btn(TONE_BTN.quiet)}>
                All merchants
              </button>
            )
          }
        />
      ) : fromCar && !m.approved ? (
        <NextStep
          tone="blue"
          title={`${fromCar.registration} is waiting on this ${entity}.`}
          body={`Work the checklist below and approve the ${entity} - then head back to publish the car.`}
          actions={
            <button type="button" onClick={() => navigate(`/vehicles/${fromCar.id}`)} style={btn(TONE_BTN.quiet)}>
              Back to {fromCar.registration}
            </button>
          }
        />
      ) : null}
      {m.review_state === "changes_requested" && m.review_note && (
        <NextStep
          tone="amber"
          title={`Changes sent${m.changes_requested_at ? ` on ${new Date(m.changes_requested_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""} - waiting on ${m.name}.`}
          body={<span style={{ whiteSpace: "pre-wrap" }}>{m.review_note}</span>}
          actions={null}
        />
      )}

      <div style={RS.card}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <span style={S.avatar}>{m.initials}</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <h1 style={{ ...RS.h1, margin: 0 }}>{m.name}</h1>
              <span style={{ ...RS.statePill, background: badge.bg, borderColor: badge.border, color: badge.fg }}>
                {badge.glyph} {badge.label}
              </span>
            </div>
            <div style={RS.subline}>
              {m.owner_type === "company" ? "Company" : "Individual"} · {m.contact} · joined{" "}
              {new Date(m.joined).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
              {m.towns.length ? ` · ${m.towns.join(", ")}` : ""}
            </div>
            {m.note && <div style={{ ...RS.subline, color: "#838C9B", marginTop: 4, fontSize: 12 }}>{m.note}</div>}
          </div>
          <button
            type="button"
            onClick={() => navigate(`/communications?merchant=${m.id}&name=${encodeURIComponent(m.name)}`)}
            style={{ ...RS.smallBtn, height: 36 }}
          >
            Message merchant
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginTop: 18 }}>
          {[
            { label: "VEHICLES SUBMITTED", value: m.stats.submitted, fg: "#1A1F2B" },
            { label: "LIVE ON CRUZ", value: m.stats.live, fg: "#076945" },
            { label: "WAITING ON US", value: m.stats.waiting, fg: m.stats.waiting ? "#C77400" : "#9AA2B0" },
            { label: "REJECTED BEFORE", value: m.stats.rejected, fg: "#1A1F2B" },
          ].map((s) => (
            <div key={s.label} style={S.stat}>
              <div style={{ font: "600 clamp(21px,2.4vw,25px)/1 Archivo,sans-serif", color: s.fg, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
              <div style={{ ...RS.kicker, margin: "6px 0 0" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <ProgressStrip sections={sections} />
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1.55, minWidth: "min(100%, 320px)", display: "grid", gap: 16 }}>
          {sections.map((s) =>
            s.doc ? (
              <ReviewSection
                key={s.key}
                section={s}
                savingItemId={savingItemId}
                docBusy={docMut.isPending}
                onSetCheck={setCheck}
                onOpenScan={() => setModal({ kind: "scan", key: s.key })}
                onRequestUpload={() => setModal({ kind: "upload", key: s.key })}
                onUndo={() => docMut.mutate({ kind: s.key, decision: "reset" })}
                onAccept={() => docMut.mutate({ kind: s.key, decision: "accept" })}
                onComplete={() => onSectionComplete(s.key)}
              />
            ) : (
              <ReviewSection
                key={s.key}
                section={s}
                savingItemId={savingItemId}
                onSetCheck={setCheck}
                onComplete={() => onSectionComplete(s.key)}
              />
            ),
          )}

          <section style={RS.panel}>
            <div style={RS.panelHead}>
              <span style={RS.panelTitle}>Their fleet</span>
              <span style={{ font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" }}>Each car is its own review</span>
            </div>
            {m.fleet.map((v) => (
              <FleetRow key={v.id} v={v} onOpen={() => navigate(`/vehicles/${v.id}`)} />
            ))}
            <div style={RS.panelFoot}>{m.fleet_summary}</div>
          </section>

          {m.drivers && m.drivers.length > 0 && (
            <section style={RS.panel}>
              <div style={RS.panelHead}>
                <span style={RS.panelTitle}>Their drivers</span>
                <span style={{ font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" }}>Each driver is its own case</span>
              </div>
              {m.drivers.map((d) => {
                const s = DRIVER_STATUS[d.status as keyof typeof DRIVER_STATUS];
                return (
                  <div
                    key={d.id}
                    onClick={() => navigate(`/drivers/${d.id}`)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: "1px solid #F1F3F6", cursor: "pointer" }}
                  >
                    <span style={{ flex: 1, font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{d.full_name}</span>
                    <span style={{ font: "400 13px/1.3 'Instrument Sans',sans-serif", color: "#838C9B" }}>{d.county}</span>
                    {s && (
                      <span style={{ padding: "2px 9px", border: `1px solid ${s.border}`, borderRadius: 999, background: s.bg, color: s.fg, font: "600 10px/1.5 'IBM Plex Mono',monospace" }}>
                        {s.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </div>

        <div style={{ flex: 1, minWidth: "min(100%, 280px)", display: "grid", gap: 16 }}>
          <DeclaredPanel m={m} />
          <ActivityPanel events={m.events} />
        </div>
      </div>

      <DecisionDock
        sections={sections}
        canDecide={m.can_decide}
        notice={decided ? undefined : notice}
        actions={decided ? outcomeActions : actions}
        outcome={outcome}
      />

      {modal?.kind === "approve" && (
        <ApproveModal
          title={`Verify ${m.name}`}
          sub={`The merchant is told their ${entity} is verified, and their cars can go live once each passes its own review.`}
          points={[
            "Every check on every document passed.",
            waitingCars
              ? `${waitingCars} car${waitingCars === 1 ? " is" : "s are"} waiting - you'll be offered the next one.`
              : "No cars are waiting yet.",
          ]}
          cta={`Approve ${entity}`}
          busy={approveMut.isPending}
          onClose={() => setModal(null)}
          onConfirm={() => approveMut.mutate()}
        />
      )}
      {modal?.kind === "changes" && (
        <ReasonModal
          mode="changes"
          subject={m.name}
          suggestedNote={m.checklist.suggested_note.changes}
          hint="Sent in the merchant's notifications, and by SMS and email. The file reads Changes sent until you approve it."
          busy={changesMut.isPending}
          onClose={() => setModal(null)}
          onConfirm={(note) => changesMut.mutate(note)}
        />
      )}
      {modal?.kind === "upload" && (
        <UploadRequestModal
          docLabel={sectionByKey(modal.key).label}
          flaggedNote={sectionByKey(modal.key)
            .checklist.items.filter((i) => i.result === "flag")
            .map((i) => i.note ?? i.label)
            .join(" ")}
          busy={docMut.isPending}
          onClose={() => setModal(null)}
          onConfirm={(note) => docMut.mutate({ kind: modal.key, decision: "reject", note })}
        />
      )}
      {scanSection && (
        <ScanViewer
          section={scanSection}
          loadUrl={() =>
            scanSection.doc?.document_id
              ? businessDocObjectUrl(m.id, scanSection.doc.document_id)
              : Promise.reject(new Error("no document"))
          }
          savingItemId={savingItemId}
          onSetCheck={setCheck}
          onAccept={() => docMut.mutate({ kind: scanSection.key, decision: "accept" })}
          onNext={scanNext ? () => setModal({ kind: "scan", key: scanNext.key }) : undefined}
          nextLabel={scanNext?.label}
          onClose={() => setModal(null)}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}

/** What the merchant typed - the checklist compares these against the scans. */
function DeclaredPanel({ m }: { m: MerchantFileT }): JSX.Element {
  const d = m.declared;
  const groups: { title: string; rows: [string, string | null, boolean?][] }[] = [];
  if (d.company) {
    groups.push({
      title: "COMPANY",
      rows: [
        ["Registered name", d.company.name],
        ["Incorporation no.", d.company.cert_no, true],
        ["Company KRA PIN", d.company.kra_pin, true],
        ["Company email", d.company.email],
        ["Physical address", d.company.address],
      ],
    });
  }
  groups.push({
    title: d.company ? "CONTACT PERSON" : "OWNER",
    rows: [
      ["Full name", d.person.full_name],
      ["National ID no.", d.person.national_id, true],
      ["KRA PIN", d.person.kra_pin, true],
      ["Email", d.contact.email],
      ["Phone", d.contact.phone ? `${d.contact.phone}${d.contact.phone_verified ? " ✓" : " (unverified)"}` : null, true],
    ],
  });
  groups.push({
    title: "PAYOUT",
    rows:
      d.payout.method === "bank"
        ? [
            ["Method", "Bank"],
            ["Bank", d.payout.bank_name],
            ["Account name", d.payout.bank_account_name],
            ["Account no.", d.payout.bank_account_number, true],
          ]
        : [
            ["Method", "M-Pesa"],
            ["Name on the line", d.payout.mpesa_name],
            ["Number", d.contact.phone, true],
          ],
  });
  return (
    <section style={RS.panel}>
      <div style={RS.panelHead}>
        <span style={RS.panelTitle}>Declared details</span>
        <span style={{ font: "400 12px/1.3 'Instrument Sans',sans-serif", color: "#838C9B" }}>Compare against the scans</span>
      </div>
      {groups.map((g) => (
        <div key={g.title} style={{ padding: "14px 18px", borderBottom: "1px solid #F1F3F6", display: "grid", gap: 9 }}>
          <div style={{ ...RS.kicker, marginBottom: 2 }}>{g.title}</div>
          {g.rows.map(([k, v, mono]) => (
            <div key={k} style={RS.kv}>
              <span style={RS.kvKey}>{k}</span>
              <span style={{ ...RS.kvVal, color: v ? "#1A1F2B" : "#9AA2B0", ...(mono && v ? { fontFamily: "'IBM Plex Mono',monospace", fontWeight: 500 } : {}) }}>
                {v ?? "Not given"}
              </span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function FleetRow({ v, onOpen }: { v: MerchantFleetRow; onOpen: () => void }): JSX.Element {
  const tone = statusTone(v.status);
  const docsFg = v.docs_has_issue ? "#D81E32" : v.docs_accepted === v.docs_total ? "#5A6373" : "#C77400";
  return (
    <button type="button" onClick={onOpen} style={S.fleetRow}>
      <span style={S.plate}>{v.registration}</span>
      <span style={{ flex: 1, minWidth: 140, textAlign: "left" }}>
        <span style={{ display: "block", font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B" }}>{v.title}</span>
        <span style={{ display: "block", font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 2 }}>{v.spec}</span>
      </span>
      <span style={{ ...RS.chip, background: tone.tint, borderColor: tone.border, color: tone.text }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: tone.core, flex: "none" }} />
        {tone.label}
      </span>
      <span style={{ ...RS.mono, color: docsFg, fontVariantNumeric: "tabular-nums", flex: "none" }}>
        DOCS {v.docs_accepted}/{v.docs_total}
      </span>
      <span style={{ ...RS.mono, color: "#5A6373", flex: "none" }}>{money(v.daily_rate?.amount)}</span>
      <span style={{ font: "400 16px/1 'Instrument Sans',sans-serif", color: "#CDD2DA", flex: "none" }}>›</span>
    </button>
  );
}

const S = {
  avatar: { width: 52, height: 52, borderRadius: 999, background: "#F1F3F6", color: "#0F23A8", font: "600 16px/52px 'IBM Plex Mono',monospace", textAlign: "center", flex: "none" },
  stat: { padding: "13px 15px", background: "#FFFFFF", border: "1px solid #F1F3F6", borderRadius: "var(--r)" },
  fleetRow: { display: "flex", alignItems: "center", gap: "clamp(10px,1.6vw,18px)", width: "100%", padding: "14px 18px", background: "#FFFFFF", border: "none", borderTop: "1px solid #F1F3F6", cursor: "pointer", flexWrap: "wrap" },
  plate: { display: "inline-block", padding: "5px 9px", border: "1.5px solid #0B0F1A", borderRadius: "var(--r-sm)", font: "600 13px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".04em", color: "#1A1F2B", fontVariantNumeric: "tabular-nums", flex: "none" },
} satisfies Record<string, CSSProperties>;

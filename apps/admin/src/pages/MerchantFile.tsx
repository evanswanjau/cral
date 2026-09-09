import { useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveMerchant,
  businessDocObjectUrl,
  decideBusinessDocument,
  fetchMerchantFile,
  reopenMerchantReview,
  setMerchantChecklistItem,
  type BusinessDocLine,
  type MerchantFile as MerchantFileT,
  type MerchantFleetRow,
} from "../lib/merchants-api.js";
import type { CheckResult } from "../lib/vehicles-api.js";
import { ApiClientError } from "../lib/api.js";
import { ChecklistPanel } from "../components/console/ChecklistPanel.js";
import { usePageTitle } from "../lib/use-page-title.js";
import { money, statusTone } from "../components/console/status.js";

const BADGE: Record<string, { label: string; bg: string; border: string; fg: string }> = {
  verified: { label: "VERIFIED", bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" },
  new_merchant: { label: "NEW MERCHANT", bg: "#FFF3DB", border: "#F5D9A3", fg: "#8A5200" },
};

export function MerchantFile(): JSX.Element {
  const { merchantId } = useParams<{ merchantId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ text: string; dot: string } | null>(null);
  const flash = (text: string, dot = "#0B8A5B") => {
    setToast({ text, dot });
    window.setTimeout(() => setToast(null), 3600);
  };

  const { data: m, isLoading, error } = useQuery({
    queryKey: ["admin", "merchants", "file", merchantId],
    queryFn: () => fetchMerchantFile(merchantId!),
    enabled: !!merchantId,
  });
  usePageTitle(m ? m.name : "Merchant");

  const onFile = (next: MerchantFileT) => {
    qc.setQueryData(["admin", "merchants", "file", merchantId], next);
    void qc.invalidateQueries({ queryKey: ["admin", "merchants", "list"] });
  };
  const docMut = useMutation({
    mutationFn: (v: { kind: string; decision: "accept" | "reject"; note?: string }) =>
      decideBusinessDocument(merchantId!, v.kind, v.decision, v.note),
    onSuccess: onFile,
    onError: (e) => flash(e instanceof ApiClientError ? e.message : "That didn't work.", "#D81E32"),
  });
  const checkMut = useMutation({
    mutationFn: (v: { itemId: string; result: CheckResult; note?: string }) =>
      setMerchantChecklistItem(merchantId!, v.itemId, v.result, v.note),
    onSuccess: onFile,
    onError: (e) => flash(e instanceof ApiClientError ? e.message : "That didn't save.", "#D81E32"),
  });
  const approveMut = useMutation({
    mutationFn: () => approveMerchant(merchantId!),
    onSuccess: (next) => {
      onFile(next);
      flash(`${next.name} is verified. New cars only need their own documents now.`);
    },
    onError: (e) => flash(e instanceof ApiClientError ? e.message : "That didn't work.", "#D81E32"),
  });
  const reopenMut = useMutation({
    mutationFn: () => reopenMerchantReview(merchantId!),
    onSuccess: (next) => {
      onFile(next);
      flash(`${next.name}'s business approval reopened.`, "#C77400");
    },
    onError: (e) => flash(e instanceof ApiClientError ? e.message : "That didn't work.", "#D81E32"),
  });

  if (isLoading) return <div style={S.loading}>Loading the file…</div>;
  if (error || !m) {
    return (
      <div style={S.loading}>
        Couldn't load that merchant.{" "}
        <button type="button" style={S.link} onClick={() => navigate("/merchants")}>
          All merchants
        </button>
      </div>
    );
  }

  const b = BADGE[m.badge]!;
  const ref = `MERCHANT · ${m.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  const stats: { label: string; value: number; fg: string }[] = [
    { label: "VEHICLES SUBMITTED", value: m.stats.submitted, fg: "#1A1F2B" },
    { label: "LIVE ON CRUZ", value: m.stats.live, fg: "#076945" },
    { label: "WAITING ON US", value: m.stats.waiting, fg: m.stats.waiting ? "#C77400" : "#9AA2B0" },
    { label: "REJECTED BEFORE", value: m.stats.rejected, fg: "#1A1F2B" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <button type="button" onClick={() => navigate("/merchants")} style={S.back}>
          ‹ All merchants
        </button>
        <span style={{ font: "400 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".05em", color: "#9AA2B0" }}>{ref}</span>
      </div>

      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <span style={S.avatar}>{m.initials}</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <h1 style={S.h1}>{m.name}</h1>
              <span style={{ ...S.badge, background: b.bg, borderColor: b.border, color: b.fg }}>{b.label}</span>
            </div>
            <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", marginTop: 5 }}>
              {m.contact} · joined{" "}
              {new Date(m.joined).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
              {m.towns.length ? ` · ${m.towns.join(", ")}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap" }}>
            <button type="button" disabled title="Ships with Communications" style={S.msgBtn}>
              Message merchant
            </button>
            {m.approved ? (
              <button
                type="button"
                disabled={reopenMut.isPending}
                onClick={() => reopenMut.mutate()}
                style={S.reopenBtn}
              >
                Reopen review
              </button>
            ) : (
              <button
                type="button"
                disabled={approveMut.isPending}
                onClick={() =>
                  m.can_approve
                    ? approveMut.mutate()
                    : flash(
                        m.approve_blockers.documents > 0
                          ? `${m.approve_blockers.documents} business document${m.approve_blockers.documents === 1 ? "" : "s"} still to accept.`
                          : `${m.approve_blockers.checklist} checklist blocker${m.approve_blockers.checklist === 1 ? "" : "s"} still open.`,
                        "#C77400",
                      )
                }
                style={{ ...S.approveBtn, ...(m.can_approve ? {} : { background: "#076945" }) }}
              >
                Approve business
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginTop: 20 }}>
          {stats.map((s) => (
            <div key={s.label} style={S.stat}>
              <div style={{ font: "600 clamp(21px,2.4vw,25px)/1 Archivo,sans-serif", color: s.fg, fontVariantNumeric: "tabular-nums" }}>
                {s.value}
              </div>
              <div style={{ font: "500 10px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0", marginTop: 6 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {m.note && (
        <div style={S.note}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: "#C77400", flex: "none", marginTop: 5 }} />
          <div style={{ font: "400 13px/1.55 'Instrument Sans',sans-serif", color: "#8A5200" }}>{m.note}</div>
        </div>
      )}

      <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>
        <section style={S.panel}>
          <div style={S.panelHead}>
            <div>
              <span style={{ font: "600 15px/1.2 Archivo,sans-serif", color: "#1A1F2B" }}>Business documents</span>
              <div style={{ font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 3 }}>
                Reviewed once. An approved business doesn't re-submit these for each new car.
              </div>
            </div>
            <span style={{ font: "500 11px/1 'IBM Plex Mono',monospace", letterSpacing: ".06em", color: m.approved ? "#0B8A5B" : "#C77400" }}>
              {m.business_documents.filter((d) => d.state === "ok").length} OF {m.business_documents.length} ACCEPTED
            </span>
          </div>
          {m.business_documents.map((d) => (
            <BusinessDocRow
              key={d.kind}
              merchantId={m.id}
              line={d}
              busy={docMut.isPending}
              onAccept={() => docMut.mutate({ kind: d.kind, decision: "accept" })}
              onReject={(note) => docMut.mutate({ kind: d.kind, decision: "reject", note })}
            />
          ))}
        </section>

        <ChecklistPanel
          title="Verification checklist"
          block={m.checklist}
          busy={checkMut.isPending}
          onSet={(itemId, result, note) => checkMut.mutate({ itemId, result, ...(note ? { note } : {}) })}
        />
      </div>

      <div style={S.panel}>
        <div style={S.panelHead}>
          <span style={{ font: "600 15px/1.2 Archivo,sans-serif", color: "#1A1F2B" }}>Their fleet</span>
          <span style={{ font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B" }}>Open any vehicle to review it</span>
        </div>
        {m.fleet.map((v) => (
          <FleetRow key={v.id} v={v} onOpen={() => navigate(`/vehicles/${v.id}`)} />
        ))}
        <div style={S.panelFoot}>{m.fleet_summary}</div>
      </div>

      {toast && (
        <div style={S.toast}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: toast.dot, flex: "none" }} />
          <span style={{ font: "500 13px/1.35 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

function BusinessDocRow({
  merchantId,
  line,
  busy,
  onAccept,
  onReject,
}: {
  merchantId: string;
  line: BusinessDocLine;
  busy: boolean;
  onAccept: () => void;
  onReject: (note: string) => void;
}): JSX.Element {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const accepted = line.state === "ok";
  const rejected = line.state === "rejected";
  const dot = accepted ? "#0B8A5B" : rejected ? "#D81E32" : line.state === "missing" ? "#E4E7EC" : "#C77400";

  return (
    <div style={{ ...S.bdRow, background: rejected ? "#FDE7EA" : "#FFFFFF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, flex: "none" }} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{line.label}</div>
          <div style={{ font: "400 12px/1.4 'Instrument Sans',sans-serif", color: rejected ? "#D81E32" : accepted ? "#0B8A5B" : "#838C9B", marginTop: 2 }}>
            {rejected && line.review_note ? line.review_note : line.state === "missing" ? "Not uploaded" : accepted ? "Accepted by you" : "Not yet reviewed"}
          </div>
        </div>
        <button
          type="button"
          disabled={!line.document_id}
          onClick={() =>
            line.document_id &&
            businessDocObjectUrl(merchantId, line.document_id).then((u) => window.open(u, "_blank")).catch(() => {})
          }
          style={{ ...S.bdBtn, opacity: line.document_id ? 1 : 0.4 }}
        >
          Open scan
        </button>
        <div style={{ display: "flex", gap: 6, flex: "none" }}>
          <button
            type="button"
            disabled={busy || line.state === "missing"}
            onClick={onAccept}
            style={{ ...S.bdBtn, background: accepted ? "#0B8A5B" : "#FFFFFF", color: accepted ? "#FFFFFF" : "#0B8A5B", borderColor: accepted ? "#0B8A5B" : "#A8DEC7" }}
          >
            Accept
          </button>
          <button
            type="button"
            disabled={busy || line.state === "missing"}
            onClick={() => setRejecting((v) => !v)}
            style={{ ...S.bdBtn, background: rejected ? "#D81E32" : "#FFFFFF", color: rejected ? "#FFFFFF" : "#D81E32", borderColor: rejected ? "#D81E32" : "#F7BDC5" }}
          >
            Reject
          </button>
        </div>
      </div>
      {rejecting && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What the merchant reads - quoted verbatim."
            style={S.bdTextarea}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={S.bdBtn} onClick={() => { setRejecting(false); setNote(""); }}>
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !note.trim()}
              style={{ ...S.bdBtn, background: "#D81E32", color: "#fff", borderColor: "#D81E32" }}
              onClick={() => { onReject(note.trim()); setRejecting(false); }}
            >
              Send rejection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FleetRow({ v, onOpen }: { v: MerchantFleetRow; onOpen: () => void }): JSX.Element {
  const tone = statusTone(v.status);
  const docsFg = v.docs_has_issue ? "#D81E32" : v.docs_accepted === v.docs_total ? "#5A6373" : "#C77400";
  return (
    <div onClick={onOpen} style={S.fleetRow}>
      <span style={S.plate}>{v.registration}</span>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ font: "600 15px/1.25 Archivo,sans-serif", color: "#1A1F2B" }}>{v.title}</div>
        <div style={{ font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 2 }}>{v.spec}</div>
      </div>
      <span style={{ ...S.statePill, background: tone.tint, borderColor: tone.border, color: tone.text }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: tone.core, flex: "none" }} />
        {tone.label}
      </span>
      <span style={{ font: "500 12px/1.3 'IBM Plex Mono',monospace", color: docsFg, fontVariantNumeric: "tabular-nums", flex: "none" }}>
        {v.docs_accepted}/{v.docs_total}
      </span>
      <span style={{ font: "500 12px/1.3 'IBM Plex Mono',monospace", color: "#5A6373", flex: "none" }}>
        {money(v.daily_rate?.amount)}
      </span>
      <span style={{ font: "400 16px/1 'Instrument Sans',sans-serif", color: "#CDD2DA", flex: "none" }}>›</span>
    </div>
  );
}

const S = {
  loading: { padding: 40, font: "400 13px/1.6 'Instrument Sans',sans-serif", color: "#5A6373" },
  link: { background: "none", border: "none", padding: 0, color: "#0F23A8", cursor: "pointer", font: "600 13px/1 'Instrument Sans',sans-serif" },
  back: { display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px 0 8px", background: "transparent", color: "#5A6373", border: "none", borderRadius: "var(--r-sm)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  card: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", padding: "clamp(18px,2.4vw,24px)", marginBottom: 16 },
  avatar: { width: 52, height: 52, borderRadius: 999, background: "#F1F3F6", color: "#0F23A8", font: "600 16px/52px 'IBM Plex Mono',monospace", textAlign: "center", flex: "none" },
  h1: { margin: 0, font: "600 clamp(22px,2.8vw,27px)/1.15 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", letterSpacing: "-.02em", color: "#1A1F2B" },
  badge: { display: "inline-flex", alignItems: "center", padding: "3px 10px", border: "1px solid", borderRadius: 999, font: "600 10px/1.6 'IBM Plex Mono',monospace", letterSpacing: ".05em" },
  msgBtn: { height: 40, padding: "0 15px", background: "#FFFFFF", color: "#9AA2B0", border: "1px solid #E4E7EC", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "not-allowed" },
  reviewBtn: { height: 40, padding: "0 17px", background: "#0F23A8", color: "#FFFFFF", border: "none", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  approveBtn: { height: 40, padding: "0 17px", background: "#0B8A5B", color: "#FFFFFF", border: "none", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  reopenBtn: { height: 40, padding: "0 15px", background: "#FFFFFF", color: "#8A5200", border: "1px solid #F5D9A3", borderRadius: "var(--r)", font: "600 13px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  stat: { padding: "13px 15px", background: "#FFFFFF", border: "1px solid #F1F3F6", borderRadius: "var(--r)" },
  bdRow: { padding: "14px 18px", borderBottom: "1px solid #F1F3F6" },
  bdBtn: { height: 32, padding: "0 12px", background: "#FFFFFF", color: "#0F23A8", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  bdTextarea: { width: "100%", minHeight: 70, padding: 12, border: "1.5px solid #E4E7EC", borderRadius: "var(--r)", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#1A1F2B", background: "#FFFFFF", resize: "vertical" },
  toast: { position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 11, padding: "13px 18px", background: "#F1F3F6", borderRadius: 999, boxShadow: "0 12px 32px rgba(11,15,26,.3)", zIndex: 70, maxWidth: "calc(100vw - 32px)" },
  note: { display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px", background: "#FFF3DB", border: "1px solid #F5D9A3", borderRadius: "var(--r-lg)", marginBottom: 16 },
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 18px", borderBottom: "1px solid #F1F3F6", flexWrap: "wrap" },
  panelFoot: { padding: "12px 18px", background: "#FFFFFF", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
  fleetRow: { display: "flex", alignItems: "center", gap: "clamp(12px,1.6vw,20px)", padding: "14px 18px", borderBottom: "1px solid #F1F3F6", cursor: "pointer", flexWrap: "wrap" },
  plate: { display: "inline-block", padding: "5px 9px", border: "1.5px solid #0B0F1A", borderRadius: "var(--r-sm)", font: "600 13px/1.2 'IBM Plex Mono',monospace", letterSpacing: ".04em", color: "#1A1F2B", fontVariantNumeric: "tabular-nums", flex: "none" },
  statePill: { display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", border: "1px solid", borderRadius: 999, font: "600 12px/1.3 'Instrument Sans',sans-serif", flex: "none" },
} satisfies Record<string, CSSProperties>;

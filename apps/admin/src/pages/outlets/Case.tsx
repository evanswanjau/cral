import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChecklistRow } from "../../components/console/review/ChecklistRow.js";
import { ReasonModal } from "../../components/console/review/modals.js";
import type { ChecklistItem, CheckResult } from "../../lib/vehicles-api.js";
import {
  SERVICE_LABELS,
  assignOutlet,
  decideOutlet,
  fetchOutletCase,
  outletPhotoObjectUrl,
  setOutletCheck,
  type OutletCase,
} from "../../lib/outlets-api.js";
import { usePageTitle } from "../../lib/use-page-title.js";
import { OUTLET_STATUS } from "./Queue.js";

/**
 * One outlet case (Phase 4 GS1 - docs/decisions/garage.md). Checklist-first
 * on the shared review engine; the "Premises visited" line is the visit
 * record (date + who went) behind any "visited" the merchant or a customer
 * sees. Not from a canvas; built in the console's idiom (drivers/Case.tsx)
 * with the shared ChecklistRow.
 */

const MIN_PHOTOS = 2;
const DECIDABLE = ["pending", "review"];

function nairobiToday(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function Case(): JSX.Element {
  const { outletId } = useParams<{ outletId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const key = ["admin", "outlets", outletId];
  const { data: o, isLoading, error } = useQuery({ queryKey: key, queryFn: () => fetchOutletCase(outletId!), enabled: !!outletId });
  usePageTitle(o ? o.name : "Outlet");

  const [modal, setModal] = useState<null | "changes" | "reject">(null);
  const [err, setErr] = useState<string | null>(null);

  const onDone = (updated: OutletCase) => {
    qc.setQueryData(key, updated);
    void qc.invalidateQueries({ queryKey: ["admin", "outlets", "list"] });
    setErr(null);
  };
  const onFail = (e: unknown) => setErr(e instanceof Error ? e.message : "That didn't go through. Try again.");

  const checkMut = useMutation({
    mutationFn: (v: Parameters<typeof setOutletCheck>[1]) => setOutletCheck(outletId!, v),
    onSuccess: onDone,
    onError: onFail,
  });
  const assignMut = useMutation({ mutationFn: () => assignOutlet(outletId!), onSuccess: onDone, onError: onFail });
  const decideMut = useMutation({
    mutationFn: (v: { action: "approve" | "request_changes" | "reject"; note?: string }) => decideOutlet(outletId!, v.action, v.note),
    onSuccess: (u) => {
      onDone(u);
      setModal(null);
    },
    onError: onFail,
  });

  if (isLoading) return <div style={S.empty}>Loading…</div>;
  if (error || !o) return <div style={S.empty}>Couldn't load that outlet.</div>;

  const s = OUTLET_STATUS[o.status];
  const open = DECIDABLE.includes(o.status);
  const cl = o.checklist;
  const blockers = [
    !cl.complete && `${cl.outstanding} ${cl.outstanding === 1 ? "check" : "checks"} to answer`,
    cl.flagged > 0 && `${cl.flagged} flagged`,
    !o.merchant.approved && "account not approved",
    o.photos.length < MIN_PHOTOS && `fewer than ${MIN_PHOTOS} photos`,
  ].filter((x): x is string => !!x);
  const canApprove = open && blockers.length === 0;
  const groups = [...new Set(cl.items.map((i) => i.group))];
  const onSet = (itemId: string, result: CheckResult, note?: string) => checkMut.mutate({ item_id: itemId, result, note: note ?? null });

  return (
    <div>
      <button type="button" onClick={() => navigate("/outlets")} style={S.backBtn}>← All outlets</button>

      <div style={S.headRow}>
        <div>
          <h1 style={S.h1}>{o.name}</h1>
          <p style={S.lede}>{o.address} · {o.county}</p>
        </div>
        <span style={{ ...S.badge, background: s.bg, borderColor: s.border, color: s.fg }}>{s.label}</span>
      </div>

      <div style={S.facts}>
        <Fact label="KIND" value={o.kind === "garage" ? "Garage" : "Parts"} />
        <Fact label="OPENING HOURS" value={o.opening_hours} />
        <Fact label="PHONE" value={o.phone ?? "Not given"} />
        <Fact label="MERCHANT" value={o.merchant.name} link={`/merchants/${o.merchant.id}`} />
        <Fact label="REVIEWER" value={o.assignee?.name ?? "Unassigned"} />
      </div>

      {o.service_types.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
          {o.service_types.map((t) => (
            <span key={t} style={S.pill}>{SERVICE_LABELS[t] ?? t}</span>
          ))}
        </div>
      )}

      {!o.merchant.approved && (
        <div style={S.warn}>
          The merchant's account isn't approved yet, so this outlet can't go live.{" "}
          <Link to={`/merchants/${o.merchant.id}`} style={{ color: "#0F23A8", fontWeight: 600 }}>Review the account</Link>
        </div>
      )}
      {o.reviewer_note && !open && <div style={S.warn}>Last note to the merchant: {o.reviewer_note}</div>}

      <div style={S.panel}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>Photos</span>
          <span style={S.mono}>{o.photos.length} UPLOADED</span>
        </div>
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
          {o.photos.map((p) => (
            <Photo key={p.id} outletId={o.id} photoId={p.id} alt={p.original_name} />
          ))}
        </div>
      </div>

      <div style={{ ...S.panel, marginTop: 16 }}>
        <div style={S.panelHead}>
          <span style={S.panelTitle}>Checklist</span>
          <span style={S.mono}>
            {cl.checked}/{cl.total} ANSWERED{cl.flagged ? ` · ${cl.flagged} FLAGGED` : ""}
          </span>
        </div>
        {groups.map((g) => (
          <div key={g}>
            <div style={S.groupHead}>{g.toUpperCase()}</div>
            {cl.items
              .filter((i) => i.group === g)
              .map((item, idx) =>
                item.id === "visit_done" ? (
                  <VisitRow key={item.id} item={item} o={o} disabled={!open || checkMut.isPending} onSave={(v) => checkMut.mutate(v)} />
                ) : (
                  <ChecklistRow key={item.id} item={item} index={idx} saving={checkMut.isPending || !open} onSet={onSet} />
                ),
              )}
          </div>
        ))}
      </div>

      {err && <div style={{ ...S.warn, marginTop: 16, background: "#FDE7EA", borderColor: "#F7BDC5", color: "#A50E22" }}>{err}</div>}

      {open && (
        <div style={{ ...S.panel, padding: 18, marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            disabled={!canApprove || decideMut.isPending}
            style={{ ...S.btn, background: canApprove ? "#0B8A5B" : "#F1F3F6", borderColor: canApprove ? "#0B8A5B" : "#E4E7EC", color: canApprove ? "#FFFFFF" : "#9AA2B0" }}
            onClick={() => decideMut.mutate({ action: "approve" })}
          >
            Approve outlet
          </button>
          <button type="button" disabled={!cl.complete} style={{ ...S.btn, opacity: cl.complete ? 1 : 0.5 }} onClick={() => setModal("changes")}>
            Request changes
          </button>
          <button
            type="button"
            disabled={!cl.complete}
            style={{ ...S.btn, color: "#D81E32", borderColor: "#F7BDC5", opacity: cl.complete ? 1 : 0.5 }}
            onClick={() => setModal("reject")}
          >
            Reject
          </button>
          <button type="button" style={S.btn} disabled={assignMut.isPending} onClick={() => assignMut.mutate()}>
            Assign to me
          </button>
          {blockers.length > 0 && <span style={S.hint}>Approve needs: {blockers.join(", ")}.</span>}
        </div>
      )}

      {modal && (
        <ReasonModal
          mode={modal}
          subject={o.name}
          suggestedNote={modal === "reject" ? cl.suggested_note.reject : cl.suggested_note.changes}
          hint="The merchant reads this as written."
          busy={decideMut.isPending}
          onConfirm={(note) => decideMut.mutate({ action: modal === "reject" ? "reject" : "request_changes", note })}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/** The visit: a date and who went, recorded with the pass. A flag clears it. */
function VisitRow({
  item,
  o,
  disabled,
  onSave,
}: {
  item: ChecklistItem;
  o: OutletCase;
  disabled: boolean;
  onSave: (v: Parameters<typeof setOutletCheck>[1]) => void;
}): JSX.Element {
  const [on, setOn] = useState(o.visit?.visited_on ?? nairobiToday());
  const [by, setBy] = useState(o.visit?.visited_by ?? "");
  const [note, setNote] = useState(item.note ?? "");
  useEffect(() => setNote(item.note ?? ""), [item.note]);
  const done = item.result === "pass" && o.visit;

  return (
    <div style={{ ...S.docRow, background: item.result === "flag" ? "#FDE7EA" : "#FFFFFF" }}>
      <div style={S.panelTitle}>{item.label}</div>
      <div style={S.help}>{item.help}</div>
      {done ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <span style={{ ...S.pill, background: "#DDF3E9", borderColor: "#A8DEC7", color: "#076945" }}>
            VISITED {fmtDay(o.visit!.visited_on).toUpperCase()} BY {o.visit!.visited_by.toUpperCase()}
          </span>
          {o.visit!.recorded_by_name && <span style={S.help}>Recorded by {o.visit!.recorded_by_name}</span>}
          <button type="button" style={S.btn} disabled={disabled} onClick={() => onSave({ item_id: item.id, result: "pending" })}>
            Undo
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="date" max={nairobiToday()} value={on} onChange={(e) => setOn(e.target.value)} style={S.input} aria-label="Visit date" />
            <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="Who went" style={{ ...S.input, flex: "1 1 180px" }} aria-label="Who went" />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional, required to flag)" style={S.input} aria-label="Note" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={disabled || !on || !by.trim()}
              style={{ ...S.btn, color: "#0B8A5B", borderColor: "#A8DEC7" }}
              onClick={() => onSave({ item_id: item.id, result: "pass", visited_on: on, visited_by: by.trim(), note: note.trim() || null })}
            >
              Record visit
            </button>
            <button
              type="button"
              disabled={disabled || !note.trim()}
              style={{ ...S.btn, color: "#D81E32", borderColor: item.result === "flag" ? "#D81E32" : "#F7BDC5" }}
              onClick={() => onSave({ item_id: item.id, result: "flag", note: note.trim() })}
            >
              {item.result === "flag" ? "Flagged" : "Couldn't confirm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Photo({ outletId, photoId, alt }: { outletId: string; photoId: string; alt: string }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let live = true;
    outletPhotoObjectUrl(outletId, photoId)
      .then((u) => {
        made = u;
        if (live) setUrl(u);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [outletId, photoId]);
  const box: CSSProperties = { width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 8, background: "#F1F3F6", display: "block" };
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt={alt} style={box} />
    </a>
  ) : (
    <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", ...S.help }}>File not loaded</div>
  );
}

function Fact({ label, value, link }: { label: string; value: string; link?: string }): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={S.mono}>{label}</span>
      {link ? (
        <Link to={link} style={{ ...S.factValue, color: "#0F23A8", textDecoration: "none" }}>{value}</Link>
      ) : (
        <span style={{ ...S.factValue, color: "#1A1F2B" }}>{value}</span>
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
  pill: { display: "inline-flex", alignItems: "center", padding: "3px 10px", border: "1px solid #E4E7EC", borderRadius: 999, background: "#FAFBFC", font: "600 11px/1.5 'IBM Plex Mono',monospace", letterSpacing: ".04em", color: "#333B4A" },
  facts: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))", gap: 16, marginBottom: 18 },
  factValue: { font: "600 14px/1.3 'Instrument Sans',sans-serif", overflow: "hidden", textOverflow: "ellipsis" },
  mono: { font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  warn: { padding: "12px 14px", marginBottom: 16, background: "#FFF3DB", border: "1px solid #F5D9A3", borderRadius: "var(--r)", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#8A5200" },
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 18px", borderBottom: "1px solid #F1F3F6" },
  panelTitle: { font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" },
  groupHead: { padding: "12px 18px 6px", font: "500 10px/1 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#9AA2B0" },
  help: { font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 2 },
  hint: { font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#8A5200" },
  docRow: { padding: "14px 18px", borderBottom: "1px solid #F1F3F6" },
  input: { height: 36, padding: "0 10px", border: "1.5px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "400 13px/1 'Instrument Sans',sans-serif", color: "#1A1F2B", background: "#FFFFFF" },
  btn: { height: 32, padding: "0 12px", background: "#FFFFFF", color: "#0F23A8", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  empty: { padding: "28px 18px", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#838C9B" },
} satisfies Record<string, CSSProperties>;

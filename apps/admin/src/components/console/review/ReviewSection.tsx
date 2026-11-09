import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChecklistRow, type SetCheck } from "./ChecklistRow.js";
import { SECTION_META, needsDecision, sectionAnchor, sectionStatus, type SectionModel } from "./model.js";
import { RS, TONE_BTN } from "./styles.js";

/**
 * A document (or a checks-only block) with its checklist underneath.
 *
 * The document's state follows the checklist: every line passed ->
 * Accepted, anything flagged -> Needs changes. Once a section is decided
 * its answer buttons fold away behind a status chip and a "Change" menu
 * (ask for a new upload / undo) - the reviewer isn't left looking at live
 * Accept/Reject buttons on a finished line.
 */
export function ReviewSection({
  section,
  savingItemId,
  docBusy,
  onSetCheck,
  onOpenScan,
  onRequestUpload,
  onUndo,
  onAccept,
  onComplete,
  children,
}: {
  section: SectionModel;
  savingItemId: string | null;
  docBusy?: boolean;
  onSetCheck: SetCheck;
  onOpenScan?: () => void;
  onRequestUpload?: () => void;
  onUndo?: () => void;
  /** Only for a document with no checks of its own - it is accepted by hand. */
  onAccept?: () => void;
  /** Fired when the checklist goes from incomplete to complete - the parent moves the reviewer on. */
  onComplete?: () => void;
  children?: ReactNode;
}): JSX.Element {
  const status = sectionStatus(section);
  const meta = SECTION_META[status];
  const cl = section.checklist;
  const doc = section.doc;
  const [open, setOpen] = useState(!cl.complete);

  // Fold a section away the moment its last line is answered.
  const wasComplete = useRef(cl.complete);
  useEffect(() => {
    if (cl.complete && !wasComplete.current) {
      setOpen(false);
      onComplete?.();
    }
    if (!cl.complete && wasComplete.current) setOpen(true);
    wasComplete.current = cl.complete;
  }, [cl.complete, onComplete]);

  const decided = status !== "todo" && status !== "working" && status !== "missing";
  const menuItems: { label: string; tone?: "danger"; onClick: () => void }[] = [];
  if (doc?.document_id && status !== "sent_back" && onRequestUpload) {
    menuItems.push({ label: "Ask for a new upload", tone: "danger", onClick: onRequestUpload });
  }
  if (doc && onUndo && (doc.state === "ok" || doc.state === "rejected" || cl.checked > 0)) {
    menuItems.push({ label: "Undo and start this document again", onClick: onUndo });
  }

  const pct = cl.total ? Math.round((cl.checked / cl.total) * 100) : 0;
  const sub =
    status === "sent_back" && doc?.review_note
      ? doc.review_note
      : doc
        ? [doc.original_name ?? (doc.state === "missing" ? "Nothing uploaded yet" : null), doc.expires_at ? `expires ${doc.expires_at}` : null]
            .filter(Boolean)
            .join(" · ")
        : section.hint ?? "";

  return (
    <section id={sectionAnchor(section.key)} style={{ ...RS.panel, scrollMarginTop: 16, borderColor: open && !cl.complete ? "#CFD6F5" : "#E4E7EC" }}>
      <div style={S.head}>
        <span style={{ ...S.glyph, background: meta.bg, color: meta.fg, borderColor: meta.border }} aria-hidden>
          {meta.glyph}
        </span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={RS.panelTitle}>{section.label}</div>
          {sub && (
            <div style={{ ...RS.panelSub, color: status === "sent_back" ? "#A50E22" : "#838C9B" }}>{sub}</div>
          )}
        </div>
        <span style={{ ...RS.chip, background: meta.bg, color: meta.fg, borderColor: meta.border }}>
          {meta.glyph} {status === "working" ? `${cl.checked} of ${cl.total}` : meta.label}
        </span>
        {onOpenScan && (
          <button type="button" onClick={onOpenScan} disabled={!doc?.document_id} style={{ ...RS.smallBtn, opacity: doc?.document_id ? 1 : 0.4 }}>
            Open scan
          </button>
        )}
        {menuItems.length > 0 && <Menu label={decided ? "Change ▾" : "⋯"} busy={!!docBusy} items={menuItems} />}
      </div>

      {children}

      {needsDecision(section) && onAccept && (
        <div style={S.handDecide}>
          <span style={{ flex: 1, minWidth: 200 }}>
            No checks apply to this document for this {section.key === "tracker_certificate" ? "car" : "case"}. Open the
            scan, look it over, and accept it - or ask for a new upload.
          </span>
          <button type="button" disabled={docBusy} onClick={onAccept} style={{ ...RS.smallBtn, ...TONE_BTN.approve }}>
            ✓ Accept
          </button>
        </div>
      )}

      {cl.total > 0 && (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} style={S.toggle} aria-expanded={open}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#9AA2B0", width: 10 }}>{open ? "▾" : "▸"}</span>
              {cl.complete ? "Checklist complete" : "Checklist"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end" }}>
              <span style={{ ...RS.bar, width: 120, maxWidth: "30vw" }}>
                <span style={{ width: `${pct}%`, background: cl.flagged ? "#C77400" : "#0B8A5B", transition: "width .25s" }} />
              </span>
              <span style={{ ...RS.mono, color: cl.flagged ? "#8A5200" : cl.complete ? "#076945" : "#5A6373" }}>
                {cl.checked}/{cl.total}
                {cl.flagged ? ` · ${cl.flagged} FLAGGED` : ""}
              </span>
            </span>
          </button>
          {open &&
            cl.items.map((it, i) => (
              <ChecklistRow key={it.id} item={it} index={i} saving={savingItemId === it.id} onSet={onSetCheck} />
            ))}
        </>
      )}
    </section>
  );
}

function Menu({
  label,
  busy,
  items,
}: {
  label: string;
  busy: boolean;
  items: { label: string; tone?: "danger"; onClick: () => void }[];
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative", flex: "none" }}>
      <button type="button" disabled={busy} onClick={() => setOpen((v) => !v)} style={{ ...RS.smallBtn, color: "#5A6373" }} aria-haspopup="menu" aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div role="menu" style={S.menu}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); it.onClick(); }}
              style={{ ...S.menuItem, color: it.tone === "danger" ? "#A50E22" : "#1A1F2B" }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const S = {
  head: { display: "flex", alignItems: "center", gap: 12, padding: "15px 18px", flexWrap: "wrap" },
  glyph: { width: 28, height: 28, flex: "none", display: "grid", placeItems: "center", border: "1px solid", borderRadius: 999, font: "600 13px/1 'Instrument Sans',sans-serif" },
  handDecide: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 18px", background: "#FAFBFC", borderTop: "1px solid #F1F3F6", font: "400 12px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" },
  toggle: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", padding: "10px 18px", background: "#FAFBFC", border: "none", borderTop: "1px solid #F1F3F6", font: "600 12px/1 'Instrument Sans',sans-serif", color: "#5A6373", cursor: "pointer", flexWrap: "wrap" },
  menu: { position: "absolute", right: 0, top: 36, zIndex: 20, minWidth: 240, padding: 4, background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r)", boxShadow: "0 12px 32px rgba(11,15,26,.14)" },
  menuItem: { display: "block", width: "100%", padding: "10px 12px", background: "none", border: "none", borderRadius: "var(--r-sm)", textAlign: "left", font: "600 13px/1.3 'Instrument Sans',sans-serif", cursor: "pointer" },
} satisfies Record<string, CSSProperties>;

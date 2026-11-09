import { useEffect, useState, type ReactNode } from "react";
import { ChecklistRow, type SetCheck } from "./ChecklistRow.js";
import { SECTION_META, needsDecision, sectionStatus, type SectionModel } from "./model.js";
import { RS } from "./styles.js";

export function Shell({
  title,
  sub,
  width,
  children,
  footer,
  onClose,
}: {
  title: string;
  sub?: string | undefined;
  width: number;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div style={RS.overlay} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{ ...RS.modal, maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div style={RS.modalHead}>
          <div>
            <div style={{ font: "600 17px/1.25 Archivo,sans-serif", fontVariationSettings: "'wdth' 106", color: "#1A1F2B" }}>{title}</div>
            {sub && <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373", marginTop: 4, maxWidth: "60ch" }}>{sub}</div>}
          </div>
          <button type="button" onClick={onClose} style={RS.modalX} aria-label="Close">×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {footer && <div style={RS.modalFoot}>{footer}</div>}
      </div>
    </div>
  );
}

/** Approve confirmation - a summary of what happens, and an optional note. */
export function ApproveModal({
  title,
  sub,
  points,
  cta,
  withNote,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  sub: string;
  points: string[];
  cta: string;
  withNote?: boolean;
  busy: boolean;
  onConfirm: (note?: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [note, setNote] = useState("");
  return (
    <Shell
      title={title}
      sub={sub}
      width={540}
      onClose={onClose}
      footer={
        <>
          <button type="button" style={RS.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy} style={{ ...RS.ctaBtn, background: "#0B8A5B" }} onClick={() => onConfirm(note.trim() || undefined)}>
            {cta}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 15 }}>
        <div style={{ display: "grid", gap: 9 }}>
          {points.map((t) => (
            <div key={t} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
              <span style={{ color: "#0B8A5B", font: "600 13px/1.55 'Instrument Sans',sans-serif", flex: "none" }}>✓</span>
              <div style={{ font: "400 13px/1.55 'Instrument Sans',sans-serif", color: "#333B4A" }}>{t}</div>
            </div>
          ))}
        </div>
        {withNote && (
          <label style={{ display: "block" }}>
            <span style={RS.fieldLabel}>Note for the merchant · optional</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything they should know." style={RS.textarea} />
          </label>
        )}
      </div>
    </Shell>
  );
}

/**
 * Request changes / reject. Opens pre-filled from the flagged checklist
 * items; the canned templates stay as quick-adds that append.
 */
export function ReasonModal({
  mode,
  subject,
  suggestedNote,
  templates,
  hint,
  busy,
  onConfirm,
  onClose,
}: {
  mode: "changes" | "reject";
  subject: string;
  suggestedNote: string;
  templates?: [string, string][];
  hint: string;
  busy: boolean;
  onConfirm: (note: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [note, setNote] = useState(suggestedNote);
  const reject = mode === "reject";
  return (
    <Shell
      title={reject ? `Reject ${subject}` : `Request changes · ${subject}`}
      sub={
        reject
          ? "A rejection closes the case. The merchant must start a fresh submission."
          : "Nothing is published. The merchant fixes what you list and comes back to you."
      }
      width={580}
      onClose={onClose}
      footer={
        <>
          <button type="button" style={RS.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            type="button"
            disabled={busy || !note.trim()}
            style={{ ...RS.ctaBtn, background: reject ? "#D81E32" : "#C77400", opacity: note.trim() ? 1 : 0.5 }}
            onClick={() => onConfirm(note.trim())}
          >
            {reject ? "Reject and close" : "Send to merchant"}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 15 }}>
        <label style={{ display: "block" }}>
          <span style={RS.fieldLabel}>What the merchant reads</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={suggestedNote ? undefined : "Say what needs to change, plainly."}
            style={{ ...RS.textarea, minHeight: 150 }}
          />
          <span style={{ display: "block", marginTop: 6, font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#838C9B" }}>
            {suggestedNote ? "Written from the checks you flagged. Edit freely." : "Nothing was flagged - write the reason yourself, or add one below."}
          </span>
        </label>
        {templates && templates.length > 0 && (
          <div>
            <span style={RS.fieldLabel}>Add a common reason</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {templates.map(([label, body]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setNote((n) => (n.trim() ? `${n.trimEnd()}\n- ${body}` : body))}
                  style={{ ...RS.smallBtn, color: "#333B4A" }}
                >
                  + {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div
          style={{
            ...RS.hint,
            background: reject ? "#FDE7EA" : "#FFF3DB",
            border: `1px solid ${reject ? "#F7BDC5" : "#F5D9A3"}`,
            color: reject ? "#A50E22" : "#8A5200",
          }}
        >
          {hint}
        </div>
      </div>
    </Shell>
  );
}

/** "Ask for a new upload" on one document - the merchant reads the note verbatim. */
export function UploadRequestModal({
  docLabel,
  flaggedNote,
  busy,
  onConfirm,
  onClose,
}: {
  docLabel: string;
  flaggedNote: string;
  busy: boolean;
  onConfirm: (note: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [note, setNote] = useState(flaggedNote);
  return (
    <Shell
      title={`Ask for a new ${docLabel.toLowerCase()}`}
      sub="The merchant is told straight away and uploads a replacement. Its checks are skipped until the new file arrives."
      width={520}
      onClose={onClose}
      footer={
        <>
          <button type="button" style={RS.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy || !note.trim()} style={{ ...RS.ctaBtn, background: "#D81E32", opacity: note.trim() ? 1 : 0.5 }} onClick={() => onConfirm(note.trim())}>
            Send request
          </button>
        </>
      }
    >
      <label style={{ display: "block" }}>
        <span style={RS.fieldLabel}>What the merchant reads</span>
        <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The scan is cut off at the top - photograph the whole page." style={RS.textarea} />
      </label>
    </Shell>
  );
}

/**
 * The scan beside its checklist, so the reviewer ticks lines while looking
 * at the document instead of flipping between a modal and the page.
 */
export function ScanViewer({
  section,
  loadUrl,
  savingItemId,
  onSetCheck,
  onNext,
  nextLabel,
  onAccept,
  onClose,
}: {
  section: SectionModel;
  loadUrl: () => Promise<string>;
  /** For a document with no checks of its own - accept it from the viewer. */
  onAccept?: (() => void) | undefined;
  savingItemId: string | null;
  onSetCheck: SetCheck;
  onNext?: (() => void) | undefined;
  nextLabel?: string | undefined;
  onClose: () => void;
}): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [failed, setFailed] = useState(false);
  const docId = section.doc?.document_id;
  useEffect(() => {
    let made: string | null = null;
    let live = true;
    setUrl(null);
    setFailed(false);
    loadUrl()
      .then((u) => {
        made = u;
        if (!live) return URL.revokeObjectURL(u);
        // An image fits the pane; a PDF needs the browser's own viewer.
        return fetch(u)
          .then((r) => r.blob())
          .then((b) => {
            if (!live) return;
            setIsImage(b.type.startsWith("image/"));
            setUrl(u);
          });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
    // loadUrl is recreated each render; the document id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const status = sectionStatus(section);
  const meta = SECTION_META[status];
  const cl = section.checklist;
  return (
    <Shell
      title={section.label}
      sub={[section.doc?.original_name, section.doc?.expires_at ? `expires ${section.doc.expires_at}` : null].filter(Boolean).join(" · ") || undefined}
      width={1180}
      onClose={onClose}
    >
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "stretch" }}>
        <div style={{ flex: "1.4 1 420px", height: "min(68vh, 760px)", minHeight: 360, borderRadius: "var(--r)", border: "1px solid #E4E7EC", background: "#F1F3F6", display: "grid", placeItems: "center", overflow: "hidden" }}>
          {failed ? (
            <span style={{ ...RS.mono, color: "#A50E22" }}>FILE NO LONGER STORED</span>
          ) : url ? (
            isImage ? (
              <a href={url} target="_blank" rel="noreferrer" title="Open full size" style={{ width: "100%", height: "100%", display: "block" }}>
                <img src={url} alt={section.label} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
              </a>
            ) : (
              <iframe title={section.label} src={url} style={{ width: "100%", height: "100%", border: "none" }} />
            )
          ) : (
            <span style={{ ...RS.mono, color: "#838C9B" }}>LOADING…</span>
          )}
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", border: "1px solid #E4E7EC", borderRadius: "var(--r)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 18px", background: "#FAFBFC" }}>
            <span style={{ ...RS.chip, background: meta.bg, color: meta.fg, borderColor: meta.border }}>
              {meta.glyph} {meta.label}
            </span>
            <span style={{ ...RS.mono, color: "#5A6373" }}>
              {cl.checked}/{cl.total}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {needsDecision(section) && (
              <div style={{ padding: "16px 18px", display: "grid", gap: 12, font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#5A6373" }}>
                No checks apply to this document here. Look the scan over and accept it - or close this and ask for a new upload.
                {onAccept && (
                  <button type="button" onClick={onAccept} style={{ ...RS.actBtn, background: "#0B8A5B", color: "#FFFFFF", justifySelf: "start" }}>
                    ✓ Accept
                  </button>
                )}
              </div>
            )}
            {cl.items.map((it, i) => (
              <ChecklistRow key={it.id} item={it} index={i} saving={savingItemId === it.id} onSet={onSetCheck} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 18px", borderTop: "1px solid #F1F3F6" }}>
            {onNext ? (
              <button type="button" onClick={onNext} disabled={!cl.complete} style={{ ...RS.actBtn, background: cl.complete ? "#0F23A8" : "#F1F3F6", color: cl.complete ? "#FFFFFF" : "#9AA2B0", cursor: cl.complete ? "pointer" : "not-allowed" }}>
                {nextLabel ?? "Next"} →
              </button>
            ) : (
              <button type="button" onClick={onClose} style={{ ...RS.actBtn, background: "#0F23A8", color: "#FFFFFF" }}>
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

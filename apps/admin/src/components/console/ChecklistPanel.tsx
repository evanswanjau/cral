import { useState, type CSSProperties } from "react";
import type { ChecklistBlock, ChecklistItem, CheckResult } from "../../lib/vehicles-api.js";

/**
 * The working checklist a reviewer clicks through - shared by the vehicle
 * case and the merchant file. Each row: label + help, a Pass / Flag
 * toggle, and (when the reviewer wants) a note. A `block` row that isn't
 * `pass` shows a red marker and gates "Approve"; `flag`s feed the
 * request-changes / reject note.
 */
export function ChecklistPanel({
  title,
  block,
  busy,
  onSet,
}: {
  title: string;
  block: ChecklistBlock;
  busy: boolean;
  onSet: (itemId: string, result: CheckResult, note?: string) => void;
}): JSX.Element {
  const groups = [...new Set(block.items.map((i) => i.group))];
  return (
    <section style={S.panel}>
      <div style={S.head}>
        <div>
          <div style={S.title}>{title}</div>
          <div style={S.sub}>
            Work each line. A blocked line must pass before you can approve; anything you flag drops
            into the request-changes note.
          </div>
        </div>
        <span style={{ ...S.count, color: block.blockers_outstanding ? "#A50E22" : "#5A6373" }}>
          {block.checked}/{block.total} CHECKED
          {block.flagged ? ` · ${block.flagged} FLAGGED` : ""}
          {block.blockers_outstanding ? ` · ${block.blockers_outstanding} OPEN` : ""}
        </span>
      </div>

      {groups.map((g) => (
        <div key={g}>
          <div style={S.groupHead}>{g}</div>
          {block.items
            .filter((i) => i.group === g)
            .map((it) => (
              <ChecklistRow key={it.id} item={it} busy={busy} onSet={onSet} />
            ))}
        </div>
      ))}
    </section>
  );
}

/** One checklist line - reused by the standalone panel and the per-document accordions. */
export function ChecklistRow({
  item,
  busy,
  onSet,
}: {
  item: ChecklistItem;
  busy: boolean;
  onSet: (itemId: string, result: CheckResult, note?: string) => void;
}): JSX.Element {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(item.note ?? "");
  const isBlockOpen = item.severity === "block" && item.result !== "pass";

  const set = (result: CheckResult) => onSet(item.id, result, note.trim() || undefined);

  return (
    <div style={{ ...S.row, background: item.result === "flag" ? "#FFF9EE" : "#FFFFFF" }}>
      <span
        style={{
          ...S.marker,
          background: item.result === "pass" ? "#0B8A5B" : item.result === "flag" ? "#C77400" : isBlockOpen ? "#D81E32" : "#E4E7EC",
        }}
      />
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ font: "600 13px/1.35 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>
          {item.label}
          {item.severity === "block" && <span style={S.blockTag}>MUST PASS</span>}
        </div>
        <div style={{ font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#5A6373", marginTop: 2 }}>
          {item.help}
        </div>
        {item.result === "flag" && item.note && (
          <div style={{ font: "400 12px/1.4 'Instrument Sans',sans-serif", color: "#8A5200", marginTop: 4 }}>
            Flagged: {item.note}
          </div>
        )}
        {noteOpen && (
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What's wrong - drops into the request-changes note."
              style={S.textarea}
            />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button type="button" style={S.miniBtn} onClick={() => setNoteOpen(false)}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flex: "none" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => set(item.result === "pass" ? "pending" : "pass")}
          style={{
            ...S.toggle,
            background: item.result === "pass" ? "#0B8A5B" : "#FFFFFF",
            color: item.result === "pass" ? "#FFFFFF" : "#0B8A5B",
            borderColor: item.result === "pass" ? "#0B8A5B" : "#A8DEC7",
          }}
        >
          Pass
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            set(item.result === "flag" ? "pending" : "flag");
            if (item.result !== "flag") setNoteOpen(true);
          }}
          style={{
            ...S.toggle,
            background: item.result === "flag" ? "#C77400" : "#FFFFFF",
            color: item.result === "flag" ? "#FFFFFF" : "#8A5200",
            borderColor: item.result === "flag" ? "#C77400" : "#F5D9A3",
          }}
        >
          Flag
        </button>
        <button type="button" style={S.noteBtn} onClick={() => setNoteOpen((v) => !v)} title="Add a note">
          ✎
        </button>
      </div>
    </div>
  );
}

const S = {
  panel: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", overflow: "hidden" },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px", borderBottom: "1px solid #F1F3F6", flexWrap: "wrap" },
  title: { font: "600 15px/1.2 Archivo,sans-serif", color: "#1A1F2B" },
  sub: { font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#838C9B", marginTop: 3, maxWidth: "60ch" },
  count: { font: "500 10px/1.4 'IBM Plex Mono',monospace", letterSpacing: ".06em", flex: "none" },
  groupHead: {
    padding: "9px 18px",
    background: "#FAFBFC",
    borderBottom: "1px solid #F1F3F6",
    font: "500 10px/1 'IBM Plex Mono',monospace",
    letterSpacing: ".1em",
    color: "#9AA2B0",
  },
  row: { display: "flex", alignItems: "flex-start", gap: 13, padding: "13px 18px", borderBottom: "1px solid #F1F3F6", flexWrap: "wrap" },
  marker: { width: 8, height: 8, borderRadius: 999, marginTop: 5, flex: "none" },
  blockTag: {
    marginLeft: 8,
    padding: "1px 6px",
    background: "#FDE7EA",
    borderRadius: "var(--r-sm)",
    font: "600 8px/1.5 'IBM Plex Mono',monospace",
    letterSpacing: ".06em",
    color: "#A50E22",
    verticalAlign: "middle",
  },
  toggle: {
    height: 30,
    padding: "0 12px",
    border: "1px solid",
    borderRadius: "var(--r-sm)",
    font: "600 12px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
  noteBtn: {
    width: 30,
    height: 30,
    background: "#FFFFFF",
    color: "#5A6373",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r-sm)",
    font: "400 13px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
  miniBtn: {
    height: 28,
    padding: "0 12px",
    background: "#FFFFFF",
    color: "#1A1F2B",
    border: "1px solid #E4E7EC",
    borderRadius: "var(--r-sm)",
    font: "600 12px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
  textarea: {
    width: "100%",
    minHeight: 60,
    padding: 10,
    border: "1.5px solid #E4E7EC",
    borderRadius: "var(--r)",
    font: "400 13px/1.5 'Instrument Sans',sans-serif",
    color: "#1A1F2B",
    background: "#FFFFFF",
    resize: "vertical",
  },
} satisfies Record<string, CSSProperties>;

import { useEffect, useState, type CSSProperties } from "react";
import type { ChecklistItem, CheckResult } from "../../../lib/vehicles-api.js";

export type SetCheck = (itemId: string, result: CheckResult, note?: string) => void;

/**
 * One checklist line: the question, what to look for, and a Pass / Flag
 * switch. Every line needs an answer - there is no "must pass" tier any
 * more. Flagging opens a note that drops into the request-changes note;
 * clicking the active answer again clears it.
 */
export function ChecklistRow({
  item,
  index,
  saving,
  onSet,
}: {
  item: ChecklistItem;
  index: number;
  saving: boolean;
  onSet: SetCheck;
}): JSX.Element {
  const [note, setNote] = useState(item.note ?? "");
  const [noteOpen, setNoteOpen] = useState(false);
  useEffect(() => setNote(item.note ?? ""), [item.note]);

  if (item.skipped) {
    return (
      <div style={{ ...S.row, opacity: 0.55 }}>
        <span style={{ ...S.num, color: "#9AA2B0" }}>{String(index + 1).padStart(2, "0")}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.label}>{item.label}</div>
          <div style={S.help}>Skipped - a new upload was requested, check it again when it arrives.</div>
        </div>
      </div>
    );
  }

  const pass = item.result === "pass";
  const flag = item.result === "flag";
  const set = (r: CheckResult, n?: string) => onSet(item.id, r, n);

  return (
    <div style={{ ...S.row, background: flag ? "#FFF9EE" : "#FFFFFF" }}>
      <span style={{ ...S.num, color: pass ? "#0B8A5B" : flag ? "#C77400" : "#9AA2B0" }}>
        {pass ? "✓" : flag ? "⚑" : String(index + 1).padStart(2, "0")}
      </span>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={S.label}>{item.label}</div>
        {item.help && <div style={S.help}>{item.help}</div>}
        {flag && !noteOpen && (
          <button type="button" onClick={() => setNoteOpen(true)} style={S.noteLine}>
            {item.note ? `Note: ${item.note}` : "+ Add a note for the merchant"}
          </button>
        )}
        {flag && noteOpen && (
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What's wrong - added to the request-changes note."
              style={S.textarea}
            />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button type="button" style={S.mini} onClick={() => { setNote(item.note ?? ""); setNoteOpen(false); }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                style={{ ...S.mini, background: "#1A1F2B", color: "#FFFFFF", borderColor: "#1A1F2B" }}
                onClick={() => { set("flag", note.trim() || undefined); setNoteOpen(false); }}
              >
                Save note
              </button>
            </div>
          </div>
        )}
      </div>
      <div role="group" aria-label={`Answer: ${item.label}`} style={S.seg}>
        <button
          type="button"
          aria-pressed={pass}
          disabled={saving}
          onClick={() => set(pass ? "pending" : "pass")}
          style={{ ...S.segBtn, ...(pass ? S.segPass : {}), borderRight: "1px solid #E4E7EC" }}
        >
          ✓ Pass
        </button>
        <button
          type="button"
          aria-pressed={flag}
          disabled={saving}
          onClick={() => {
            if (flag) set("pending");
            else {
              set("flag", note.trim() || undefined);
              setNoteOpen(true);
            }
          }}
          style={{ ...S.segBtn, ...(flag ? S.segFlag : {}) }}
        >
          ⚑ Flag
        </button>
      </div>
    </div>
  );
}

const S = {
  row: { display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 18px", borderTop: "1px solid #F1F3F6", flexWrap: "wrap" },
  num: { width: 20, flex: "none", font: "600 11px/20px 'IBM Plex Mono',monospace", textAlign: "center" },
  label: { font: "600 13px/1.4 'Instrument Sans',sans-serif", color: "#1A1F2B" },
  help: { font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#5A6373", marginTop: 2 },
  noteLine: { display: "block", marginTop: 6, padding: 0, background: "none", border: "none", textAlign: "left", font: "500 12px/1.45 'Instrument Sans',sans-serif", color: "#8A5200", cursor: "pointer" },
  seg: { display: "inline-flex", flex: "none", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", overflow: "hidden", background: "#FFFFFF" },
  segBtn: { height: 30, padding: "0 12px", background: "#FFFFFF", color: "#5A6373", border: "none", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  segPass: { background: "#0B8A5B", color: "#FFFFFF" },
  segFlag: { background: "#C77400", color: "#FFFFFF" },
  mini: { height: 28, padding: "0 12px", background: "#FFFFFF", color: "#1A1F2B", border: "1px solid #E4E7EC", borderRadius: "var(--r-sm)", font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  textarea: { width: "100%", minHeight: 60, padding: 10, border: "1.5px solid #E4E7EC", borderRadius: "var(--r)", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#1A1F2B", background: "#FFFFFF", resize: "vertical" },
} satisfies Record<string, CSSProperties>;

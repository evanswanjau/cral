import { useEffect, useState } from "react";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import { P } from "../portal/styles.js";
import { O } from "../onboarding/styles.js";
import { LINE_KINDS, LINE_LABELS, kesText, previewQuote, type LineKind, type QuoteLineInput } from "../../lib/garage-api.js";
import type { Money } from "../../lib/vehicles-api.js";

/**
 * The extra-work quote form on a garage job (Phase 4 GS3): the same
 * itemised lines as a first quote. What the garage keeps comes from the
 * quote-preview endpoint in shillings; the fee rate is never shown.
 *
 * Not from a canvas; built from tokens.ts and GarageRequestDetail's form.
 */

type LineDraft = { kind: LineKind; description: string; shillings: string };
const blank = (kind: LineKind = "part"): LineDraft => ({ kind, description: "", shillings: "" });

function toLines(lines: LineDraft[]): QuoteLineInput[] {
  return lines
    .filter((l) => l.description.trim() && Number(l.shillings) > 0)
    .map((l) => ({ kind: l.kind, description: l.description.trim(), amount: Math.round(Number(l.shillings) * 100) }));
}

export function ExtraQuoteForm({
  busy,
  onSend,
  onCancel,
}: {
  busy: boolean;
  onSend: (input: { lines: QuoteLineInput[]; days_needed: number; note: string | null }) => void;
  onCancel: () => void;
}): JSX.Element {
  const [lines, setLines] = useState<LineDraft[]>([blank("part"), blank("labour")]);
  const [days, setDays] = useState("1");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<{ total: Money; take_home: Money } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const valid = toLines(lines);
  const key = JSON.stringify(valid);
  useEffect(() => {
    if (!valid.length) return setPreview(null);
    const t = setTimeout(() => {
      previewQuote(valid).then(setPreview).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function submit() {
    setProblem(null);
    if (!valid.length) return setProblem("Add at least one line with a description and an amount.");
    if (valid.length !== lines.filter((l) => l.description.trim() || l.shillings).length) {
      return setProblem("Each line needs a description and an amount, or remove it.");
    }
    const d = Number(days);
    if (!Number.isInteger(d) || d < 1 || d > 60) return setProblem("Say how many more days the work takes, 1 to 60.");
    onSend({ lines: valid, days_needed: d, note: note.trim() || null });
  }

  return (
    <div style={{ padding: 18, display: "grid", gap: 10 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select style={{ ...O.select, width: 130, flex: "none" }} value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value as LineKind })} aria-label="Line type">
            {LINE_KINDS.map((k) => (
              <option key={k} value={k}>{LINE_LABELS[k]}</option>
            ))}
          </select>
          <input style={{ ...O.input, flex: "1 1 200px" }} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Brake disc" aria-label="Description" />
          <input
            style={{ ...O.input, width: 130, flex: "none" }}
            inputMode="numeric"
            value={l.shillings}
            onChange={(e) => setLine(i, { shillings: e.target.value.replace(/\D/g, "") })}
            placeholder="KES"
            aria-label="Amount in shillings"
          />
          <button
            type="button"
            aria-label="Remove line"
            onClick={() => setLines(lines.filter((_, j) => j !== i))}
            style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF", border: "1px solid #CDD2DA", borderRadius: 8, cursor: "pointer" }}
          >
            <Trash size={18} color="#A50E22" />
          </button>
        </div>
      ))}
      <div>
        <button type="button" style={{ ...P.actionBtn, minHeight: 44, color: "#0F23A8" }} onClick={() => setLines([...lines, blank("labour")])} disabled={lines.length >= 30}>
          Add a line
        </button>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ flex: "0 0 160px" }}>
          <span style={O.label}>Extra days of work</span>
          <input style={O.input} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </label>
        <label style={{ flex: "1 1 260px" }}>
          <span style={O.label}>What you found (optional)</span>
          <input style={O.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="The front disc is scored and needs replacing." />
        </label>
      </div>
      <div style={{ padding: "12px 14px", background: "#FAFBFC", borderRadius: 8 }}>
        {preview ? (
          <>
            <div style={{ font: "700 16px/1.3 Archivo,sans-serif", color: "#0B0F1A" }}>Customer pays {kesText(preview.total)} more</div>
            <div style={O.helper}>You keep {kesText(preview.take_home)} of it after CRAL&rsquo;s service fee.</div>
          </>
        ) : (
          <div style={O.helper}>Add a line with an amount to see what you keep.</div>
        )}
      </div>
      <div style={O.helper}>Don&rsquo;t do the extra work until the customer has said yes and paid it. You&rsquo;ll get a notification.</div>
      {problem && <div style={O.fieldError}>{problem}</div>}
      <div style={P.mastActions}>
        <button
          type="button"
          style={{ ...P.actionBtn, minHeight: 44, background: "#0F23A8", color: "#FFFFFF", borderColor: "#0F23A8" }}
          disabled={busy}
          onClick={submit}
        >
          {busy ? "Sending…" : "Send extra-work quote"}
        </button>
        <button type="button" style={{ ...P.actionBtn, minHeight: 44 }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

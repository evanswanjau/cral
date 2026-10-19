import { useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";
import { color, font } from "../tokens.js";

export interface CodeInputProps {
  /** The digits entered so far - always contiguous, never longer than `length`. */
  value: string;
  onChange: (value: string) => void;
  /** Called once the last box is filled by typing, pasting or autofill. */
  onComplete?: (code: string) => void;
  /** 6 for sign-in / verification codes, 4 for the pickup code. */
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Paints every box red - pair it with an error message, never colour alone. */
  invalid?: boolean;
  /** Read out as the group's name, e.g. "Verification code". */
  label?: string;
  /** Put on the first box, so a `<label htmlFor>` still lands somewhere. */
  id?: string;
}

/**
 * A one-time code as one box per digit - used for every code the product
 * asks someone to type, in all three portals (owner's call, 2026-09-24).
 *
 * It behaves like a single field underneath:
 * - typing a digit moves to the next box, Backspace steps back;
 * - pasting the whole code anywhere fills every box;
 * - the first box carries `autocomplete="one-time-code"`, so a phone's
 *   "from Messages" suggestion drops the whole code in at once - which is
 *   why no box sets `maxLength`: a length cap would cut an autofilled code
 *   down to its first digit before `onChange` ever saw it.
 *
 * Only digits are accepted. The value is a plain string, so callers keep
 * sending exactly what they sent from the old single input.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  autoFocus,
  disabled,
  invalid,
  label = "Code",
  id,
}: CodeInputProps): JSX.Element {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const digits = value.replace(/\D/g, "").slice(0, length);
  // What was last handed to onChange. Focus moves happen in the same tick
  // as a commit, before the parent re-renders with the new value, so the
  // "never leave a gap" check below must read this, not the stale prop.
  const latest = useRef(digits);
  latest.current = digits;

  const focusBox = (i: number) => {
    const box = refs.current[Math.max(0, Math.min(length - 1, i))];
    box?.focus();
    box?.select();
  };

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    if (clean === digits) return;
    latest.current = clean;
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  // Boxes fill left to right: typing into a box past the first empty one
  // lands in the first empty one, so the value never has a gap.
  const put = (i: number, typed: string) => {
    const at = Math.min(i, digits.length);
    const incoming = typed.replace(/\D/g, "");
    if (!incoming) return;
    if (incoming.length >= length) {
      // A whole code (autofill, or a paste the browser delivered as input).
      commit(incoming);
      focusBox(length - 1);
      return;
    }
    const next = (digits.slice(0, at) + incoming + digits.slice(at + incoming.length)).slice(0, length);
    commit(next);
    focusBox(at + incoming.length);
  };

  const onInput = (i: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    // A whole code arriving at once (phone autofill) replaces everything.
    if (raw.length >= length) {
      put(0, raw);
      return;
    }
    // Typing into a filled box: keep only what was added to it.
    const existing = digits[i] ?? "";
    put(i, existing && raw.length > 1 ? raw.replace(existing, "") : raw);
  };

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (i < digits.length) {
        commit(digits.slice(0, i) + digits.slice(i + 1));
        focusBox(i);
      } else if (i > 0) {
        commit(digits.slice(0, i - 1));
        focusBox(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(Math.min(i + 1, digits.length));
    }
  };

  const onPaste = (i: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    // A full-length paste is the code, wherever it was dropped.
    put(pasted.length >= length ? 0 : i, pasted);
  };

  return (
    <div role="group" aria-label={label} style={{ display: "flex", gap: length > 4 ? 8 : 10 }}>
      {Array.from({ length }, (_, i) => {
        const active = focused === i;
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={i === 0 ? id : undefined}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`${label}, digit ${i + 1} of ${length}`}
            aria-invalid={invalid || undefined}
            autoFocus={autoFocus && i === 0}
            disabled={disabled}
            value={digits[i] ?? ""}
            onChange={onInput(i)}
            onKeyDown={onKeyDown(i)}
            onPaste={onPaste(i)}
            onFocus={(e) => {
              // Never leave a gap: jump to the first empty box.
              if (i > latest.current.length) {
                focusBox(latest.current.length);
                return;
              }
              setFocused(i);
              e.target.select();
            }}
            onBlur={() => setFocused((f) => (f === i ? null : f))}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              maxWidth: 58,
              height: 56,
              padding: 0,
              textAlign: "center",
              font: `600 24px/1 ${font.mono}`,
              color: color.neutral[900],
              background: disabled ? color.neutral[100] : "#FFFFFF",
              border: `1.5px solid ${
                invalid ? color.cruzRed : active ? color.cruzBlue : color.neutral[300]
              }`,
              borderRadius: "var(--r, 8px)",
              boxShadow: active && !invalid ? "0 0 0 3px rgba(15,35,168,.12)" : "none",
              outline: "none",
              transition: "border-color 120ms cubic-bezier(.2,.8,.25,1)",
            }}
          />
        );
      })}
    </div>
  );
}

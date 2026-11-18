import { useRef } from "react";

/**
 * The date pill on a search's filter bar, moved unchanged out of
 * `pages/Browse.tsx` in UI2b so `/machinery/search` shares it with
 * `/cars/search`.
 */

const CALENDAR_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

/** "23 Sep" - a tag and a pill have no room for a full date. */
function shortDay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * A date field wearing the pill shape - so "where", "when" and "what
 * kind" are three controls of the same weight on one line. The native
 * `<input type="date">` is the real control (keyboard, and a phone's own
 * picker), laid over the pill at zero opacity; the pill's click opens it
 * through `showPicker()` rather than making the renter hit the tiny
 * calendar glyph. Browsers without `showPicker` still focus the input.
 */
export function DatePill({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: string;
  min?: string | undefined;
  onChange: (value: string) => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const open = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };
  return (
    <label className="cral-pill cral-pill-date" data-active={value ? "true" : undefined} onClick={open}>
      {CALENDAR_ICON}
      <span className="cral-pill-date-label">{label}</span>
      <span>{value ? shortDay(value) : "Any day"}</span>
      <input
        ref={inputRef}
        type="date"
        aria-label={label}
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Clear ${label.toLowerCase()} date`}
          className="cral-pill-clear"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange("");
            }
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </span>
      )}
    </label>
  );
}

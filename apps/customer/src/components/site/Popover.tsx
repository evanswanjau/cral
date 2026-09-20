import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A pill trigger plus an anchored panel - the disclosure the filter bar
 * is built on. The pill is the same control the small `Dropdown` renders
 * (`.cral-pill`), so a filter that opens a panel and one that opens a
 * menu are the same object to a renter.
 *
 * Children are a render prop so the panel's own actions can close it.
 */
export function Popover({
  label,
  icon,
  summary,
  active,
  count,
  width = 320,
  align = "left",
  children,
}: {
  /** Accessible name, and the pill's text when nothing is chosen. */
  label: string;
  icon?: ReactNode;
  /** What the pill reads once something is chosen ("2 nights", "3 on"). */
  summary?: string | undefined;
  active?: boolean;
  /** Badge inside the pill - how many filters this panel currently holds. */
  count?: number | undefined;
  width?: number;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="cral-pill"
        data-active={active ? "true" : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        {summary ?? label}
        {count ? <span className="cral-pill-count">{count}</span> : null}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          className="cral-pop"
          role="dialog"
          aria-label={label}
          style={{ width, ...(align === "right" ? { right: 0 } : { left: 0 }) }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** A labelled group inside a panel - the categorisation, made visible. */
export function PopoverGroup({ heading, children }: { heading: string; children: ReactNode }): JSX.Element {
  return (
    <div className="cral-pop-group">
      <div className="cral-pop-heading">{heading}</div>
      {children}
    </div>
  );
}

/**
 * One row of mutually-exclusive choices. Rendered as a radio group rather
 * than a listbox: every option is visible at once, which is the whole
 * point of moving these out of individual dropdowns.
 */
export function ChoiceRow({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <div role="radiogroup" aria-label={name} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => (
        <button
          key={o.value || "__any"}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="cral-choice"
          data-on={o.value === value ? "true" : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

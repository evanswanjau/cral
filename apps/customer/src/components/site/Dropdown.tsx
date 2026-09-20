import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The hero search's county picker, generalised. It started life inline in
 * `pages/Home.tsx` and is shared now so `/browse`'s filter bar can't drift
 * from it - one menu, one hover/focus treatment, one caret.
 *
 * Built custom rather than on a native `<select>` for the reason the hero
 * always had: a native select can't be restyled past its own font and
 * colors, so it looked out of place next to the date fields.
 *
 * `variant` is the only thing that differs between its homes:
 * - `field` - a segment of the hero's white search bar (no border of its
 *   own; the bar draws the dividers).
 * - `pill` (the default) - the compact single-line control the filter bar
 *   uses: no kicker, 36px tall, the same shape as `Popover`'s trigger so
 *   a menu and a panel read as the same kind of object.
 */
export interface DropdownOption {
  value: string;
  label: string;
}

export function Dropdown({
  label,
  icon,
  value,
  options,
  onChange,
  placeholder,
  variant = "pill",
  disabled = false,
  neutralValue = "",
  minWidth,
}: {
  /** The small mono kicker above the value ("COUNTY", "GEARBOX"). */
  label: string;
  icon?: ReactNode;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Shown, greyed, when `value` matches no option (the "any" case). */
  placeholder: string;
  variant?: "field" | "pill";
  /**
   * The value that does NOT count as "set" - the pill only inverts to ink
   * past it. Sort always has a value ("recommended"), and a sort control
   * that permanently reads as an active filter is a lie about the state
   * of the search.
   */
  neutralValue?: string;
  disabled?: boolean;
  minWidth?: number;
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

  const selected = options.find((o) => o.value === value);
  const isSet = !!selected && selected.value !== "" && selected.value !== neutralValue;

  const caret = (
    <svg
      width={variant === "pill" ? 13 : 14}
      height={variant === "pill" ? 13 : 14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={variant === "pill" ? 2.4 : 2.2}
      style={{
        flex: "none",
        transform: open ? "rotate(180deg)" : "none",
        transition: "transform .15s ease",
      }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );

  const menu = open && !disabled && (
    <div className="cral-dd-menu" role="listbox" style={minWidth ? { minWidth } : undefined}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value || "__any"}
            type="button"
            role="option"
            aria-selected={on}
            className="cral-dd-option"
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
          >
            {o.label}
            {on && (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );

  // The pill has no kicker - its own label lives in the value line
  // ("Any county" reads as the field name until a county is picked).
  if (variant === "pill") {
    return (
      <div ref={rootRef} style={{ position: "relative" }}>
        <button
          type="button"
          className="cral-pill"
          data-active={isSet ? "true" : undefined}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
        >
          {icon}
          {selected?.label ?? placeholder}
          {caret}
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="cral-search-field cral-dd"
      data-active={isSet ? "true" : undefined}
      style={minWidth ? { minWidth } : undefined}
    >
      {icon}
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        className="cral-dd-toggle"
      >
        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <span className="cral-search-label">{label}</span>
          <span className="cral-dd-value" style={selected?.label ? undefined : { color: "#7C8697" }}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        {caret}
      </button>
      {menu}
    </div>
  );
}

export const PIN_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13Z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);

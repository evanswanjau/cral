import { useRef } from "react";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";

/**
 * A time field in the pill shape, for the `/drivers` search when the
 * renter wants a driver by the hour or for a trip (DR1). The same trick as
 * `site/DatePill.tsx`: the native `<input type="time">` lies over the
 * pill at zero opacity, so a phone opens its own picker.
 */
export function TimePill({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
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
    <label className="cral-pill cral-pill-date" data-active="true" onClick={open}>
      <Clock size={16} aria-hidden="true" />
      <span className="cral-pill-date-label">{label}</span>
      <span>{value}</span>
      <input
        ref={inputRef}
        type="time"
        aria-label={label}
        value={value}
        step={1800}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </label>
  );
}

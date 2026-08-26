import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
// Per-icon subpaths, not the package barrel - see YourDetails.tsx.
import { RadioButton } from "@phosphor-icons/react/dist/ssr/RadioButton";
import { Circle } from "@phosphor-icons/react/dist/ssr/Circle";
import { O } from "./styles.js";

export function TextInput(
  props: InputHTMLAttributes<HTMLInputElement> & { error?: boolean | undefined },
): JSX.Element {
  const { style, error, ...rest } = props;
  return (
    <input
      style={{ ...O.input, ...(error ? { border: "1px solid #D81E32" } : {}), ...style }}
      {...rest}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  const { style, children, ...rest } = props;
  return (
    <select style={{ ...O.select, ...style }} {...rest}>
      {children}
    </select>
  );
}

export function FormField({
  label,
  required,
  helper,
  error,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string | undefined;
  error?: string | undefined;
  htmlFor?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div>
      <label htmlFor={htmlFor} style={O.label}>
        {label}
        {required && <span style={O.required}> *</span>}
      </label>
      {children}
      {error ? <div style={O.fieldError}>{error}</div> : helper ? <div style={O.helper}>{helper}</div> : null}
    </div>
  );
}

export function PrimaryButton({
  children,
  small,
  style,
  disabled,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; small?: boolean }): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <button
      {...rest}
      disabled={disabled}
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
      style={{
        ...(small ? O.primaryBtnSmall : O.primaryBtn),
        ...(hover && !disabled ? O.primaryBtnHover : {}),
        ...(disabled ? { opacity: 0.55, cursor: "not-allowed" } : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  small,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; small?: boolean }): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <button
      {...rest}
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
      style={{ ...(small ? O.secondaryBtnSmall : O.secondaryBtn), ...(hover ? O.secondaryBtnHover : {}), ...style }}
    >
      {children}
    </button>
  );
}

export function GhostLink(props: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }): JSX.Element {
  const { style, children, ...rest } = props;
  return (
    <button type="button" {...rest} style={{ ...O.ghostLinkBtn, ...style }}>
      {children}
    </button>
  );
}

/**
 * A step's bottom-row "Back" - a real button with its own hit area and a
 * hover fill (design system's ghost-button spec: transparent at rest,
 * `#F1F3F6` on hover), not a bare link. See `O.backLinkRow`'s note for how
 * this differs from the small breadcrumb-style back link before a heading.
 */
export function BackButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...O.backLinkRow, ...(hover ? O.backLinkRowHover : {}) }}
    >
      {children}
    </button>
  );
}

/** Kenyan-plate style badge - bordered mono box, used for vehicle registrations. */
export function PlateBadge({ children }: { children: ReactNode }): JSX.Element {
  return <span style={O.plateBadge}>{children}</span>;
}

/** Selectable "which are you" / "how should we pay" card - round radio, never skewed (trust element, not a paid one). */
export function OptionCard({
  active,
  disabled,
  title,
  body,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  title: string;
  body: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...O.optionCard,
        ...(active ? O.optionCardActive : {}),
        ...(disabled ? O.optionCardDisabled : {}),
      }}
    >
      <span style={O.radioMark}>
        {active ? (
          <RadioButton size={20} weight="fill" color="#0F23A8" />
        ) : (
          <Circle size={20} color="#CDD2DA" />
        )}
      </span>
      <span>
        <div style={O.optionTitle}>{title}</div>
        <div style={O.optionBody}>{body}</div>
      </span>
    </button>
  );
}

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      style={{ ...O.toggleTrack, ...(on ? O.toggleTrackOn : O.toggleTrackOff) }}
    >
      <span style={O.toggleThumb} />
    </button>
  );
}

/** The five-state status pill (spec: colour never carries meaning alone - always dot + word). */
export function StatusPill({ status }: { status: "pending" | "review" | "verified" | "rejected" }): JSX.Element {
  const map = {
    pending: { core: "#C77400", tint: "#FFF3DB", border: "#F5D9A3", text: "#8A5200", label: "Pending review" },
    review: { core: "#0B7BC1", tint: "#E1F1FA", border: "#A9D6EE", text: "#075D93", label: "In review" },
    verified: { core: "#0B8A5B", tint: "#DDF3E9", border: "#A8DEC7", text: "#076945", label: "Verified" },
    rejected: { core: "#D81E32", tint: "#FDE7EA", border: "#F7BDC5", text: "#A50E22", label: "Rejected" },
  }[status];
  return (
    <span style={{ ...O.statusPillBase, background: map.tint, border: `1px solid ${map.border}`, color: map.text }}>
      <span style={{ ...O.statusDot, background: map.core }} />
      {map.label}
    </span>
  );
}

/** A KES amount with the prefix set apart and lighter, tabular numerals, no decimals - per the design system. */
export function Kes({ amount, size = 14 }: { amount: number; size?: number }): JSX.Element {
  return (
    <span style={{ fontFeatureSettings: "'tnum'" }}>
      <span style={{ font: `500 ${size - 2}px/1 'IBM Plex Mono',monospace`, color: "#9AA2B0", marginRight: 4 }}>
        KES
      </span>
      <span style={{ font: `600 ${size}px/1 'IBM Plex Mono',monospace`, color: "#0B0F1A" }}>
        {amount.toLocaleString("en-KE")}
      </span>
    </span>
  );
}

export function ErrorBanner({ message }: { message: string }): JSX.Element {
  return (
    <div style={O.errorBanner} role="alert">
      <span style={O.errorDot} />
      <span style={O.errorText}>{message}</span>
    </div>
  );
}

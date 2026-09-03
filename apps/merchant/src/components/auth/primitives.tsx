import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { S } from "./styles.js";

/** Mono uppercase field label, optionally with an action on the right (e.g. Show/Hide). */
export function Field({
  id,
  label,
  action,
  helper,
  children,
}: {
  id: string;
  label: string;
  action?: ReactNode;
  helper?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div>
      {action ? (
        <div style={S.labelRow}>
          <label htmlFor={id} style={{ ...S.label, marginBottom: 0 }}>
            {label}
          </label>
          {action}
        </div>
      ) : (
        <label htmlFor={id} style={S.label}>
          {label}
        </label>
      )}
      {children}
      {helper && <div style={S.helper}>{helper}</div>}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  const { style, ...rest } = props;
  return <input style={{ ...S.input, ...style }} {...rest} />;
}

/** The large centred six-digit OTP input. */
export function CodeInput(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  const { style, ...rest } = props;
  return <input inputMode="numeric" maxLength={6} placeholder="000000" style={{ ...S.codeInput, ...style }} {...rest} />;
}

/** Kenyan phone entry - fixed +254 prefix, national part in the input. */
export function PhoneInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={S.phonePrefix}>+254</span>
      <TextInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="733 376 061"
        inputMode="tel"
        autoComplete="tel-national"
        style={{ flex: 1, minWidth: 0 }}
      />
    </div>
  );
}

export function PrimaryButton({
  children,
  disabled,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }): JSX.Element {
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        ...S.primaryBtn,
        ...(disabled ? { opacity: 0.55, cursor: "not-allowed" } : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Blue "we've sent it" banner used by both code-entry steps, with an
 * optional trailing action (the design's "Change" button).
 */
export function InfoBanner({ text, action }: { text: string; action?: ReactNode }): JSX.Element {
  return (
    <div style={S.infoBanner}>
      <span style={S.infoDot} />
      <span style={S.infoText}>{text}</span>
      {action}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }): JSX.Element {
  return (
    <div style={S.errorBanner} role="alert">
      <span style={S.errorDot} />
      <span style={S.errorText}>{message}</span>
    </div>
  );
}

/** Resend row under a code field: status line left, resend action right. */
export function ResendRow({
  line,
  disabled,
  onResend,
}: {
  line: string;
  disabled: boolean;
  onResend: () => void;
}): JSX.Element {
  return (
    <div style={S.splitRow}>
      <span style={S.resendLine}>{line}</span>
      <button
        type="button"
        onClick={onResend}
        disabled={disabled}
        style={{
          ...S.smallLink,
          color: disabled ? "#A7AEBB" : "#0F23A8",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        Resend code
      </button>
    </div>
  );
}

export function Checkbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}): JSX.Element {
  return (
    <button type="button" onClick={onToggle} style={S.checkboxBtn} aria-pressed={checked}>
      <span
        style={{
          ...S.checkbox,
          border: `1.5px solid ${checked ? "#0F23A8" : "#CDD2DA"}`,
          background: checked ? "#0F23A8" : "#FFFFFF",
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span style={S.checkboxLabel}>{label}</span>
    </button>
  );
}

export function GoogleIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H1.05v2.34A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H1.05a9 9 0 0 0 0 8.12l2.92-2.34Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 1.05 4.94l2.92 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

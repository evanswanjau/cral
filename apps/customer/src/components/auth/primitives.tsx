import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { S } from "./styles.js";

/** Mono uppercase field label, optionally with an action on the right. */
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

/** A password field with the design's Show/Hide action in its label row. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  helper,
  action,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  helper?: string;
  /** Extra action beside Show/Hide (sign-in's "Forgot it?"). */
  action?: ReactNode;
}): JSX.Element {
  const [reveal, setReveal] = useState(false);
  return (
    <Field
      id={id}
      label={label}
      {...(helper ? { helper } : {})}
      action={
        <span style={{ display: "inline-flex", gap: 14 }}>
          {action}
          <button type="button" style={S.inlineBtn} onClick={() => setReveal((r) => !r)}>
            {reveal ? "Hide" : "Show"}
          </button>
        </span>
      }
    >
      <TextInput
        id={id}
        type={reveal ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </Field>
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

export function InfoBanner({ text, action }: { text: ReactNode; action?: ReactNode }): JSX.Element {
  return (
    <div style={S.infoBanner} role="status">
      <span style={S.infoDot} />
      <span style={S.infoText}>{text}</span>
      {action}
    </div>
  );
}

export function ErrorBanner({ message }: { message: ReactNode }): JSX.Element {
  return (
    <div style={S.errorBanner} role="alert">
      <span style={S.errorDot} />
      <span style={S.errorText}>{message}</span>
    </div>
  );
}

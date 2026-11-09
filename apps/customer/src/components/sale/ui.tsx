import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { SALE_STATUS_LABEL, type SaleStatus } from "../../lib/sales-api.js";

/**
 * Small pieces the car-sales pages share. Same confirmed-token idiom as
 * Towing.tsx and Drivers.tsx (marketing.tsx's header explains it) - the
 * website canvas has the selling vertical's promise, not these screens.
 */

export const inputStyle: CSSProperties = {
  width: "100%",
  height: 46,
  padding: "0 13px",
  border: "1px solid #CDD2DA",
  borderRadius: 8,
  font: "400 14.5px/1 'Instrument Sans',sans-serif",
  color: "#0B0F1A",
  background: "#FFFFFF",
  boxSizing: "border-box",
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  height: "auto",
  minHeight: 90,
  padding: "10px 13px",
  lineHeight: 1.5,
  resize: "vertical",
};

export function Field({
  label,
  helper,
  error,
  children,
}: {
  label: string;
  helper?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", marginBottom: 6, font: "600 12.5px/1.3 'Instrument Sans',sans-serif", color: "#333B4A" }}>
        {label}
      </span>
      {children}
      {(error || helper) && (
        <span
          style={{
            display: "block",
            marginTop: 5,
            font: "400 12.5px/1.45 'Instrument Sans',sans-serif",
            color: error ? "#A50E22" : "#5A6373",
          }}
        >
          {error ?? helper}
        </span>
      )}
    </label>
  );
}

export function Grid({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", columnGap: 14 }}>
      {children}
    </div>
  );
}

export function Button({
  variant = "primary",
  style,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }): JSX.Element {
  const palette =
    variant === "primary"
      ? { background: rest.disabled ? "#7C88CF" : "#0F23A8", color: "#FFFFFF", border: "none" }
      : variant === "danger"
        ? { background: "#FFFFFF", color: "#A50E22", border: "1px solid #F7BDC5" }
        : { background: "#FFFFFF", color: "#0B0F1A", border: "1px solid #CDD2DA" };
  return (
    <button
      type="button"
      {...rest}
      style={{
        height: 42,
        padding: "0 18px",
        borderRadius: 8,
        font: "600 14px/1 'Instrument Sans',sans-serif",
        cursor: rest.disabled ? "default" : "pointer",
        ...palette,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function StatusChip({ status }: { status: SaleStatus }): JSX.Element {
  const s = SALE_STATUS_LABEL[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 24,
        padding: "0 10px",
        borderRadius: 999,
        background: s.bg,
        color: s.tone,
        font: "600 12px/1 'Instrument Sans',sans-serif",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.tone }} />
      {s.label}
    </span>
  );
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "red" | "green" | "blue"; children: ReactNode }): JSX.Element {
  const c = {
    amber: { bg: "#FFF3DB", border: "#F5D9A3", fg: "#8A5200" },
    red: { bg: "#FDE7EA", border: "#F7BDC5", fg: "#A50E22" },
    green: { bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" },
    blue: { bg: "#EDEFFC", border: "#C3CBF5", fg: "#0F23A8" },
  }[tone];
  return (
    <div
      style={{
        padding: "12px 14px",
        marginBottom: 14,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        color: c.fg,
        font: "500 13.5px/1.5 'Instrument Sans',sans-serif",
      }}
    >
      {children}
    </div>
  );
}

export function Check({ on, onToggle, label, helper }: { on: boolean; onToggle: () => void; label: string; helper?: string }): JSX.Element {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12, cursor: "pointer" }}>
      <input type="checkbox" checked={on} onChange={onToggle} style={{ marginTop: 3 }} />
      <span>
        <span style={{ display: "block", font: "600 14px/1.35 'Instrument Sans',sans-serif", color: "#0B0F1A" }}>{label}</span>
        {helper && <span style={{ display: "block", font: "400 12.5px/1.45 'Instrument Sans',sans-serif", color: "#5A6373" }}>{helper}</span>}
      </span>
    </label>
  );
}

/** The line every listing and enquiry carries (docs/plans/car-sales.md section 5). */
export const SAFETY_LINE = "Never pay anything before you have seen the car and the logbook in person.";

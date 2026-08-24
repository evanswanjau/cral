import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { color, controlHeight, font, radius } from "../tokens.js";

/**
 * §05 Buttons: one primary per view. "boost" is the only skewed control in
 * the product (paid placement, never trust) — see StatusBadge for the same
 * skew/counter-skew technique applied to text.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "boost";
export type ButtonSize = "lg" | "md" | "sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: { backgroundColor: color.cruzBlue, color: "#fff", border: "1px solid transparent" },
  secondary: { backgroundColor: "#fff", color: color.neutral[900], border: `1px solid ${color.neutral[300]}` },
  ghost: { backgroundColor: "transparent", color: color.cruzBlue, border: "1px solid transparent" },
  danger: { backgroundColor: "#fff", color: color.cruzRed, border: `1px solid ${color.cruzRed}` },
  boost: { backgroundColor: color.boost, color: "#fff", border: "1px solid transparent" },
};

export function Button({
  variant = "primary",
  size = "md",
  style,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const base: CSSProperties = {
    fontFamily: font.sans,
    fontSize: "14px",
    fontWeight: 600,
    height: controlHeight[size],
    padding: "0 16px",
    borderRadius: radius.md,
    cursor: "pointer",
    ...VARIANT_STYLE[variant],
    ...(variant === "boost" ? { transform: `skewX(${color.status.boosted.skewDeg}deg)` } : {}),
    ...style,
  };

  return (
    <button style={base} {...rest}>
      {variant === "boost" ? (
        <span style={{ display: "inline-block", transform: `skewX(${-color.status.boosted.skewDeg}deg)` }}>
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

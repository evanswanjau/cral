import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { color, font, radius, space } from "../tokens.js";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({ variant = "primary", style, ...rest }: ButtonProps): JSX.Element {
  const base: CSSProperties = {
    fontFamily: font.sans,
    fontSize: "14px",
    fontWeight: 600,
    padding: `${space[2]} ${space[4]}`,
    borderRadius: radius.md,
    border: "1px solid transparent",
    cursor: "pointer",
    ...(variant === "primary"
      ? { backgroundColor: color.brand[500], color: "#fff" }
      : {
          backgroundColor: "#fff",
          color: color.neutral[700],
          borderColor: color.neutral[300],
        }),
    ...style,
  };

  return <button style={base} {...rest} />;
}

import type { CSSProperties, ReactNode } from "react";
import { color, font, space } from "../tokens.js";

/**
 * The three states every list/detail screen needs, used consistently
 * instead of one-off per page (delivery plan, Phase 0 frontend).
 */

const wrapper: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: space[2],
  padding: space[6],
  textAlign: "center",
  fontFamily: font.sans,
  color: color.neutral[700],
};

export function LoadingState({ label = "Loading…" }: { label?: string }): JSX.Element {
  return <div style={wrapper}>{label}</div>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div style={wrapper}>
      <strong>{title}</strong>
      {description && <p style={{ margin: 0, color: color.neutral[500] }}>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div style={wrapper}>
      <strong style={{ color: color.status.danger.fg }}>{title}</strong>
      {description && <p style={{ margin: 0, color: color.neutral[500] }}>{description}</p>}
      {action}
    </div>
  );
}

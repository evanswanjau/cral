import { useState, type CSSProperties, type ReactNode } from "react";
import { P } from "../portal/styles.js";

/** Small building blocks shared by the dashboard's cards (moved out of pages/Dashboard.tsx). */

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function Card({ children }: { children: ReactNode }): JSX.Element {
  return <div style={P.dashCard}>{children}</div>;
}

export function CardEmpty({ title, body }: { title: string; body: string }): JSX.Element {
  return (
    <div style={P.dashCardEmpty}>
      <div style={P.dashCardEmptyTitle}>{title}</div>
      <p style={P.dashCardEmptyBody}>{body}</p>
    </div>
  );
}

export function HoverRow({
  onClick,
  children,
  style,
}: {
  onClick?: () => void;
  children: ReactNode;
  style?: CSSProperties;
}): JSX.Element {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...P.dashRow, ...style, background: hover ? "#FAFBFC" : "transparent" }}
    >
      {children}
    </div>
  );
}

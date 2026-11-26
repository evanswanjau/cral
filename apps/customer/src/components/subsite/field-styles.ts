import type { CSSProperties } from "react";

/**
 * The label and input styles of the truck request form
 * (TruckRequestPanel.tsx). They lived in `TruckSearch.tsx`, the `/trucks`
 * hero's search card, until PR H4 removed that page and its card.
 */

export const fieldLabel: CSSProperties = {
  display: "block",
  font: "600 11px/1 'IBM Plex Mono',monospace",
  letterSpacing: ".08em",
  color: "#5A6373",
  marginBottom: 7,
};

export const fieldInput: CSSProperties = {
  width: "100%",
  height: 46,
  padding: "0 12px",
  border: "1px solid #CDD2DA",
  borderRadius: 8,
  font: "400 15px/1 'Instrument Sans',sans-serif",
  color: "#0B0F1A",
  background: "#FFFFFF",
};

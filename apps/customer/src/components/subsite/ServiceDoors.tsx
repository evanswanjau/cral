import { Link } from "react-router-dom";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { LIVE_SERVICES, type LiveService } from "../../lib/services.js";

/**
 * "What do you need?": one door per live service, each a single link at
 * least 64px tall (proposal 5.1). Door label and note come from the
 * registry. The canvas `doors` block is the pattern (label + one-line
 * note, lighter border on a live door on ink); its four doors were car
 * hire plus three services that are not live, so the set itself is new.
 *
 * Since PR H4 the home page passes `services` (every live service but
 * Hire, whose search opens the page), no heading, and `columns` to lay the
 * doors out side by side on a wide screen.
 *
 * Not from a canvas; built from tokens.ts and
 * docs/plans/ui-services-proposal.md sections 0 and 5.1.
 */
export function ServiceDoors({
  heading = "WHAT DO YOU NEED?",
  tone = "dark",
  services = LIVE_SERVICES,
  columns = false,
}: {
  /** `null` for none, when the section around it already says it. */
  heading?: string | null;
  tone?: "dark" | "light";
  services?: LiveService[];
  columns?: boolean;
}): JSX.Element {
  const dark = tone === "dark";
  return (
    <div>
      {heading && (
        <div
          style={{
            font: "500 10px/1 'IBM Plex Mono',monospace",
            letterSpacing: ".11em",
            color: dark ? "#8C97A8" : "#838C9B",
            marginBottom: 12,
          }}
        >
          {heading}
        </div>
      )}
      <div
        style={{
          display: "grid",
          gap: 8,
          ...(columns
            ? { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))" }
            : {}),
        }}
      >
        {services.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.key}
              to={s.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                minHeight: 64,
                padding: "10px 14px",
                background: dark ? "rgba(255,255,255,.09)" : "#FFFFFF",
                border: `1px solid ${dark ? "#5F6B7D" : "#E4E7EC"}`,
                borderRadius: 12,
                textDecoration: "none",
              }}
            >
              <Icon
                size={24}
                aria-hidden="true"
                color={dark ? "#FFFFFF" : "#0F23A8"}
                style={{ flex: "none" }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    font: "600 15px/1.3 'Instrument Sans',sans-serif",
                    color: dark ? "#FFFFFF" : "#0B0F1A",
                  }}
                >
                  {s.label}
                </span>
                <span
                  style={{
                    display: "block",
                    marginTop: 3,
                    font: "400 12.5px/1.4 'Instrument Sans',sans-serif",
                    color: dark ? "#A7B0BE" : "#5A6373",
                  }}
                >
                  {s.note}
                </span>
              </span>
              <CaretRight
                size={18}
                aria-hidden="true"
                color={dark ? "#A7B0BE" : "#838C9B"}
                style={{ flex: "none" }}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

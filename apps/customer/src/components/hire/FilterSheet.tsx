import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal } from "@phosphor-icons/react/dist/ssr/SlidersHorizontal";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import { color, font } from "@cral/ui";

/**
 * The "Filters (n)" control on a hire listing page (PR H3): everything
 * past the where-and-when a renter arrives with. A bottom sheet on a phone
 * (dimmed page behind, a "Show results" button in thumb reach); a panel
 * anchored under the pill on a desktop, the way the old "More filters"
 * disclosure was (owner's call, 2026-09-20: filters behind one disclosure,
 * each set one restated as a removable tag under the bar).
 *
 * Portalled to `<body>`, because the filter bar is sticky with its own
 * stacking context and a fixed sheet inside it would sit under the
 * masthead. Escape and a tap outside close it; focus moves into the sheet
 * on open and back to the pill on close.
 *
 * Not from a canvas; built from tokens.ts.
 */
export function FilterSheet({
  count,
  onClear,
  children,
}: {
  /** How many of the sheet's filters are set - the badge on the pill. */
  count: number;
  onClear: () => void;
  children: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const r = pillRef.current?.getBoundingClientRect();
    if (r) setAnchor({ top: r.bottom + 8, left: Math.max(16, Math.min(r.left, window.innerWidth - 376)) });
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (sheetRef.current?.contains(t) || pillRef.current?.contains(t)) return;
      close();
    };
    // A desktop panel is anchored to where the pill was; scrolling the
    // page would leave it floating, so it closes instead.
    const onScroll = () => {
      if (window.matchMedia("(min-width: 641px)").matches) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  function close() {
    setOpen(false);
    pillRef.current?.focus();
  }

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        className="cral-pill"
        data-active={count > 0 ? "true" : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        Filters
        {count > 0 && <span className="cral-pill-count">{count}</span>}
      </button>
      {open &&
        createPortal(
          <>
            <div className="cral-sheet-backdrop" aria-hidden="true" />
            <div
              ref={sheetRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="false"
              aria-label="Filters"
              className="cral-sheet"
              style={anchor ? ({ "--sheet-top": `${anchor.top}px`, "--sheet-left": `${anchor.left}px` } as never) : undefined}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span style={{ font: `600 16px/1.2 ${font.sans}`, color: color.ink }}>Filters</span>
                <button type="button" onClick={close} aria-label="Close filters" className="cral-icon-btn">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              {children}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginTop: 18,
                  paddingTop: 14,
                  borderTop: `1px solid ${color.neutral[100]}`,
                }}
              >
                <button
                  type="button"
                  onClick={onClear}
                  disabled={count === 0}
                  className="cral-text-btn"
                  style={{ color: count > 0 ? color.cruzBlue : color.neutral[400] }}
                >
                  Clear these
                </button>
                <button
                  type="button"
                  onClick={close}
                  style={{
                    height: 44,
                    padding: "0 20px",
                    background: color.cruzBlue,
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: 8,
                    font: `600 14px/1 ${font.sans}`,
                    cursor: "pointer",
                  }}
                >
                  Show results
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/** A labelled group of choices inside the sheet. */
export function SheetGroup({ heading, hint, children }: { heading: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ marginTop: 14 }}>
      <div className="cral-pop-heading">{heading}</div>
      {children}
      {hint && (
        <p style={{ margin: "8px 0 0", font: `400 12.5px/1.45 ${font.sans}`, color: color.neutral[600] }}>{hint}</p>
      )}
    </div>
  );
}

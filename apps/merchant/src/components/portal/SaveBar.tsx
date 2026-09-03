import type { CSSProperties } from "react";

/**
 * The "Unsaved changes on this page" sticky bar, taken verbatim from
 * "Cruz Merchant Settings.dc.html" (the `sc-if value="{{dirty}}"` block near
 * the end of the file). Shared because every editable Settings tab renders
 * its own copy - only one tab is mounted at a time, so `position: sticky`
 * with a single instance matches the design's single save bar.
 *
 * It is deliberately self-contained: a tab owns its dirty state and drops
 * this in when dirty, rather than the shell coordinating a page-wide one.
 */

const S = {
  bar: {
    position: "sticky",
    bottom: 0,
    background: "#FFFFFF",
    borderTop: "1px solid #E4E7EC",
    boxShadow: "0 -6px 24px -12px rgba(11,15,26,.28)",
    padding: "12px clamp(16px,3vw,32px)",
    zIndex: 50,
    marginTop: 18,
    // Pull out to the full width of P.main's padding-free column and let the
    // inner row re-centre, so the shadow spans the content area.
    marginLeft: "calc(-1 * clamp(16px,3vw,32px))",
    marginRight: "calc(-1 * clamp(16px,3vw,32px))",
  },
  inner: {
    maxWidth: 1320,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
  },
  left: { display: "flex", alignItems: "center", gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 999, background: "#C77400", flex: "none" },
  label: { font: "600 13px/1.4 'Instrument Sans',sans-serif", color: "#8A5200" },
  actions: { display: "flex", gap: 8, flex: "none" },
  discard: {
    height: 40,
    padding: "0 15px",
    background: "#FFFFFF",
    color: "#1A1F2B",
    border: "1px solid #CDD2DA",
    borderRadius: "var(--r)",
    font: "600 13px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
  },
  save: {
    height: 40,
    padding: "0 19px",
    background: "#0F23A8",
    color: "#fff",
    border: "none",
    borderRadius: "var(--r)",
    font: "600 13px/1 'Instrument Sans',sans-serif",
    cursor: "pointer",
    transition: "background 120ms cubic-bezier(.2,.8,.25,1)",
  },
} satisfies Record<string, CSSProperties>;

export function SaveBar({
  onSave,
  onDiscard,
  saving = false,
  label = "Save changes",
  message = "Unsaved changes on this page",
}: {
  onSave: () => void;
  onDiscard: () => void;
  saving?: boolean;
  label?: string;
  message?: string;
}): JSX.Element {
  return (
    <div style={S.bar}>
      <div style={S.inner}>
        <div style={S.left}>
          <span style={S.dot} />
          <span style={S.label}>{message}</span>
        </div>
        <div style={S.actions}>
          <button type="button" style={S.discard} onClick={onDiscard} disabled={saving}>
            Discard
          </button>
          <button
            type="button"
            style={{ ...S.save, opacity: saving ? 0.6 : 1 }}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Working…" : label}
          </button>
        </div>
      </div>
    </div>
  );
}

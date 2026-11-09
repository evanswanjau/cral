import type { CSSProperties, ReactNode } from "react";
import { SECTION_META, reviewProgress, scrollToSection, sectionOpen, sectionStatus, type SectionModel } from "./model.js";
import { RS } from "./styles.js";

/** The row of section chips in the header - where the review stands, one click to each part. */
export function ProgressStrip({ sections }: { sections: SectionModel[] }): JSX.Element {
  return (
    <nav aria-label="Review sections" style={S.strip}>
      {sections.map((s, i) => {
        const status = sectionStatus(s);
        const meta = SECTION_META[status];
        return (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span style={{ color: "#CDD2DA" }} aria-hidden>›</span>}
            <button type="button" onClick={() => scrollToSection(s.key)} style={{ ...S.step, borderColor: meta.border, background: meta.bg, color: meta.fg }}>
              <span aria-hidden>{meta.glyph}</span>
              {s.label}
              {s.checklist.total > 0 && !s.checklist.complete && (
                <span style={{ ...RS.mono, color: meta.fg, opacity: 0.8 }}>
                  {s.checklist.checked}/{s.checklist.total}
                </span>
              )}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

/**
 * The decision dock - sticks to the bottom of the viewport while the
 * reviewer works. Until every check is answered it shows only progress and
 * a "continue" jump; the decisions appear once the checklist is complete
 * (checklist-first, owner's call 2026-09-25).
 */
export function DecisionDock({
  sections,
  canDecide,
  notice,
  actions,
  outcome,
}: {
  sections: SectionModel[];
  canDecide: boolean;
  /** A line above the actions - e.g. "verify the business first". */
  notice?: ReactNode;
  actions: ReactNode;
  /** When the case is already decided, shown instead of progress. */
  outcome?: ReactNode;
}): JSX.Element {
  const p = reviewProgress(sections);
  const pct = p.total ? Math.round((p.checked / p.total) * 100) : 100;
  const next = sections.find(sectionOpen);
  return (
    <div style={S.dockWrap}>
      <div style={S.dock}>
        {/* A notice explains the decisions, so it waits for them. */}
        {notice && (canDecide || outcome) && <div style={S.notice}>{notice}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            {outcome ?? (
              <>
                <div style={{ font: "600 14px/1.3 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>
                  {canDecide
                    ? p.flagged
                      ? `Checklist done · ${p.flagged} flagged`
                      : "Checklist done · everything passed"
                    : `${p.total - p.checked} check${p.total - p.checked === 1 ? "" : "s"} left`}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}>
                  <span style={{ ...RS.bar, flex: 1, maxWidth: 320 }}>
                    <span style={{ width: `${pct}%`, background: p.flagged ? "#C77400" : "#0B8A5B", transition: "width .25s" }} />
                  </span>
                  <span style={{ ...RS.mono, color: "#5A6373" }}>
                    {p.checked}/{p.total}
                  </span>
                </div>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {canDecide || outcome ? (
              actions
            ) : (
              <>
                <span style={{ font: "400 12px/1.45 'Instrument Sans',sans-serif", color: "#838C9B", maxWidth: 260 }}>
                  Decisions unlock once every check is answered.
                </span>
                {next && (
                  <button type="button" onClick={() => scrollToSection(next.key)} style={{ ...RS.actBtn, background: "#0F23A8", color: "#FFFFFF" }}>
                    Continue: {next.label} →
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A prompt that points the reviewer at the next thing to do - the other gate, or the next case. */
export function NextStep({
  tone = "blue",
  title,
  body,
  actions,
}: {
  tone?: "blue" | "green" | "amber";
  title: string;
  body?: ReactNode;
  actions: ReactNode;
}): JSX.Element {
  const t = TONES[tone];
  return (
    <div style={{ ...S.next, background: t.bg, borderColor: t.border }}>
      <span style={{ width: 9, height: 9, borderRadius: 999, background: t.core, flex: "none", marginTop: 6 }} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ font: "600 14px/1.35 'Instrument Sans',sans-serif", color: t.fg }}>{title}</div>
        {body && <div style={{ font: "400 13px/1.5 'Instrument Sans',sans-serif", color: t.fg, marginTop: 3, opacity: 0.9 }}>{body}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{actions}</div>
    </div>
  );
}

const TONES = {
  blue: { bg: "#E1F1FA", border: "#A9D6EE", fg: "#075D93", core: "#0B7BC1" },
  green: { bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945", core: "#0B8A5B" },
  amber: { bg: "#FFF3DB", border: "#F5D9A3", fg: "#8A5200", core: "#C77400" },
};

export function Toast({ toast }: { toast: { text: string; dot: string } | null }): JSX.Element | null {
  if (!toast) return null;
  return (
    <div style={RS.toast} role="status">
      <span style={{ width: 8, height: 8, borderRadius: 999, background: toast.dot, flex: "none" }} />
      <span style={{ font: "500 13px/1.35 'Instrument Sans',sans-serif", color: "#1A1F2B" }}>{toast.text}</span>
    </div>
  );
}

const S = {
  strip: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 18, paddingTop: 16, borderTop: "1px solid #F1F3F6" },
  step: { display: "inline-flex", alignItems: "center", gap: 7, height: 30, padding: "0 11px", border: "1px solid", borderRadius: 999, font: "600 12px/1 'Instrument Sans',sans-serif", cursor: "pointer" },
  dockWrap: { position: "sticky", bottom: 12, zIndex: 30, marginTop: 16 },
  dock: { background: "#FFFFFF", border: "1px solid #E4E7EC", borderRadius: "var(--r-lg)", padding: "14px 18px", boxShadow: "0 10px 30px rgba(11,15,26,.12)" },
  notice: { marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #F1F3F6", font: "400 13px/1.5 'Instrument Sans',sans-serif", color: "#333B4A" },
  next: { display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px", border: "1px solid", borderRadius: "var(--r-lg)", marginBottom: 16, flexWrap: "wrap" },
} satisfies Record<string, CSSProperties>;

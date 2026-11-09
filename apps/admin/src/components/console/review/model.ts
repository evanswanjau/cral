import type { ChecklistBlock, DocState } from "../../../lib/vehicles-api.js";

/**
 * One reviewable section of a case or a merchant file: a document with the
 * checklist that hangs under it, or a checks-only block (photos, the
 * account-wide business checks). Shared by the vehicle case and the
 * merchant file so both screens read the same way.
 *
 * Checklist-first (owner's call, 2026-09-25): every item needs an answer,
 * a document is accepted once every item under it passes, and the case's
 * decisions unlock only when every section is complete.
 */
export interface SectionDoc {
  state: DocState;
  document_id: string | null;
  review_note: string | null;
  original_name: string | null;
  expires_at: string | null;
}

export interface SectionModel {
  key: string;
  label: string;
  /** Short line under the label, e.g. what the section is for. */
  hint?: string;
  doc: SectionDoc | null;
  checklist: ChecklistBlock;
}

export type SectionStatus =
  | "todo"
  | "working"
  | "accepted"
  | "done"
  | "flagged"
  | "sent_back"
  | "missing"
  | "expiring";

export function sectionStatus(s: SectionModel): SectionStatus {
  const cl = s.checklist;
  if (s.doc?.state === "rejected") return "sent_back";
  if (s.doc?.state === "ok") return "accepted";
  if (cl.total > 0 && cl.complete) {
    if (cl.flagged) return "flagged";
    if (s.doc?.state === "expiring") return "expiring";
    return s.doc ? "accepted" : "done";
  }
  if (s.doc?.state === "missing" && cl.checked === 0) return "missing";
  return cl.checked > 0 ? "working" : "todo";
}

/**
 * An uploaded document with no checks of its own (e.g. the tracker on a car
 * under the rate line) that nobody has decided - it is accepted by hand, and
 * counts as one open check until then. Mirrors `undecidedUncheckedDocs`.
 */
export function needsDecision(s: SectionModel): boolean {
  return !!s.doc?.document_id && s.checklist.total === 0 && s.doc.state === "pending";
}

/** Whether a section still needs the reviewer - drives "jump to the next one". */
export function sectionOpen(s: SectionModel): boolean {
  return !s.checklist.complete || needsDecision(s);
}

type Meta = { label: string; glyph: string; fg: string; bg: string; border: string; core: string };

/** Glyph + word + colour, never colour alone. */
export const SECTION_META: Record<SectionStatus, Meta> = {
  todo: { label: "To review", glyph: "○", fg: "#5A6373", bg: "#F1F3F6", border: "#E4E7EC", core: "#CDD2DA" },
  working: { label: "In progress", glyph: "◐", fg: "#075D93", bg: "#E1F1FA", border: "#A9D6EE", core: "#0B7BC1" },
  accepted: { label: "Accepted", glyph: "✓", fg: "#076945", bg: "#DDF3E9", border: "#A8DEC7", core: "#0B8A5B" },
  done: { label: "Checked", glyph: "✓", fg: "#076945", bg: "#DDF3E9", border: "#A8DEC7", core: "#0B8A5B" },
  flagged: { label: "Needs changes", glyph: "⚑", fg: "#8A5200", bg: "#FFF3DB", border: "#F5D9A3", core: "#C77400" },
  expiring: { label: "Expiring soon", glyph: "!", fg: "#8A5200", bg: "#FFF3DB", border: "#F5D9A3", core: "#C77400" },
  sent_back: { label: "New upload requested", glyph: "↺", fg: "#A50E22", bg: "#FDE7EA", border: "#F7BDC5", core: "#D81E32" },
  missing: { label: "Not uploaded", glyph: "–", fg: "#838C9B", bg: "#F1F3F6", border: "#E4E7EC", core: "#E4E7EC" },
};

export function sectionAnchor(key: string): string {
  return `review-section-${key}`;
}

export function scrollToSection(key: string): void {
  document.getElementById(sectionAnchor(key))?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Totals across every section - the dock's progress. */
export function reviewProgress(sections: SectionModel[]): { checked: number; total: number; flagged: number } {
  return sections.reduce(
    (acc, s) => {
      const handDecided = !!s.doc?.document_id && s.checklist.total === 0;
      return {
        checked: acc.checked + s.checklist.checked + (handDecided && !needsDecision(s) ? 1 : 0),
        total: acc.total + s.checklist.total + (handDecided ? 1 : 0),
        flagged: acc.flagged + s.checklist.flagged,
      };
    },
    { checked: 0, total: 0, flagged: 0 },
  );
}

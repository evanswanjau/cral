import type {
  BackendVehicleStatus,
  CheckOutcome,
  DocState,
  EventTone,
  ReviewBucket,
} from "../../lib/vehicles-api.js";

/**
 * Vehicle-review status vocabulary — literal reads off "Cruz Admin
 * Vehicles.dc.html"'s `S`, `DS`, `TONE` and `age()`. These are the same
 * five brand status tints the merchant portal uses (see
 * `packages/ui/src/tokens.ts`); kept here as literals for the same reason
 * the merchant portal keeps its own copy.
 *
 * The backend's `vehicles.status` (7 states) maps to the design's five
 * review buckets: pending -> "new", review -> "inreview", action ->
 * "sent", live, rejected. `draft`/`paused` never enter the queue.
 */
type Tone = { label: string; core: string; tint: string; border: string; text: string };

const S: Record<"new" | "inreview" | "sent" | "live" | "rejected", Tone> = {
  new: { label: "Needs review", core: "#C77400", tint: "#FFF3DB", border: "#F5D9A3", text: "#8A5200" },
  inreview: { label: "With you", core: "#0B7BC1", tint: "#E1F1FA", border: "#A9D6EE", text: "#075D93" },
  sent: { label: "Changes sent", core: "#838C9B", tint: "#F1F3F6", border: "#E4E7EC", text: "#5A6373" },
  live: { label: "Approved · live", core: "#0B8A5B", tint: "#DDF3E9", border: "#A8DEC7", text: "#076945" },
  rejected: { label: "Rejected", core: "#D81E32", tint: "#FDE7EA", border: "#F7BDC5", text: "#A50E22" },
};

const STATUS_TO_KEY: Record<BackendVehicleStatus, keyof typeof S> = {
  pending: "new",
  review: "inreview",
  action: "sent",
  live: "live",
  rejected: "rejected",
};

export function statusTone(status: BackendVehicleStatus): Tone {
  return S[STATUS_TO_KEY[status]];
}

export const BUCKET_LABEL: Record<ReviewBucket | "all", string> = {
  needs_review: "Needs review",
  with_you: "With you",
  changes_sent: "Changes sent",
  approved: "Approved",
  rejected: "Rejected",
  all: "All",
};
export const BUCKET_ORDER: (ReviewBucket | "all")[] = [
  "needs_review",
  "with_you",
  "changes_sent",
  "approved",
  "rejected",
  "all",
];

/** Document dot colours — design `DS`. `missing` is a synthetic state. */
export const DOC_DOT: Record<DocState, { core: string; fg: string; label: string }> = {
  pending: { core: "#C77400", fg: "#8A5200", label: "Not yet reviewed" },
  ok: { core: "#0B8A5B", fg: "#076945", label: "Accepted by you" },
  expiring: { core: "#C77400", fg: "#8A5200", label: "Expiring soon" },
  rejected: { core: "#D81E32", fg: "#A50E22", label: "Rejected — the merchant has been told" },
  missing: { core: "#E4E7EC", fg: "#838C9B", label: "Not uploaded" },
};

export const TONE_DOT: Record<EventTone, string> = {
  grey: "#E4E7EC",
  blue: "#0B7BC1",
  green: "#0B8A5B",
  amber: "#C77400",
  red: "#D81E32",
};

export const CHECK_GLYPH: Record<CheckOutcome, { glyph: string; tint: string; fg: string; tag: string }> = {
  pass: { glyph: "✓", tint: "#DDF3E9", fg: "#076945", tag: "PASS" },
  look: { glyph: "!", tint: "#FFF3DB", fg: "#8A5200", tag: "LOOK" },
  fail: { glyph: "×", tint: "#FDE7EA", fg: "#A50E22", tag: "FAIL" },
};

/**
 * The SLA age pill — design `age(h)`, with the 48h/30h thresholds derived
 * from `sla_days` rather than hardcoded (30h ≈ "due today" against a
 * two-day promise).
 */
export function ageBadge(hours: number, slaDays: number): { label: string; long: string; bg: string; fg: string } {
  const sla = slaDays * 24;
  const dhm = `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > sla) {
    return { label: dhm, long: `OVERDUE · ${dhm} WAITING`, bg: "#FDE7EA", fg: "#A50E22" };
  }
  if (hours > sla * 0.625) {
    return { label: `${hours}h`, long: `${hours}h WAITING · DUE TODAY`, bg: "#FFF3DB", fg: "#8A5200" };
  }
  return { label: `${hours}h`, long: `${hours}h WAITING · IN TIME`, bg: "#F1F3F6", fg: "#5A6373" };
}

/** Canned reviewer-note templates — design `REASONS`. The reviewer edits the text before sending. */
export const REASON_TEMPLATES: { changes: [string, string][]; reject: [string, string][] } = {
  changes: [
    [
      "Insurance is third-party only",
      "The certificate uploaded is third-party only. A vehicle carrying paying passengers on Cruz Ride Auto must carry comprehensive cover with a PSV endorsement. Upload the comprehensive certificate and we will finish the review the same day.",
    ],
    [
      "Scan is unreadable",
      "One or more corners of the scan are cut off, so we cannot read the details. Photograph the whole page flat, in daylight, with all four corners in frame.",
    ],
    [
      "Photos do not meet the minimum",
      "We need at least three photos: a three-quarter front, the interior, and the rear. Please add the missing ones and resubmit.",
    ],
    [
      "Expired document",
      "The document you uploaded has expired. Upload the current one and the listing carries on from where it stopped.",
    ],
  ],
  reject: [
    [
      "Logbook is in a third party’s name",
      "The name on the logbook does not match your account or your company registration. We can only list vehicles you own or are contracted to manage. Upload a logbook in your name, or a signed management agreement plus the owner’s ID.",
    ],
    ["Vehicle is outside what we list", "This vehicle type is not one we can list on Cruz Ride Auto at the moment."],
    [
      "Documents appear altered",
      "The document shows signs of alteration. We have paused this submission and will call you on the number on your account.",
    ],
    [
      "Duplicate of a live listing",
      "This registration is already live under another merchant account. Only one listing per vehicle is allowed.",
    ],
  ],
};

export function money(amount: number | null | undefined): string {
  if (!amount) return "—";
  return `KES ${(amount / 100).toLocaleString("en-KE")}`;
}

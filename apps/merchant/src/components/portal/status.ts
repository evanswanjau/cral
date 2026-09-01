/**
 * The portal's status vocabulary — seven listing states plus a separate
 * verification-badge axis, and the four document review states. Values are
 * literal reads off "Cruz Merchant Portal.dc.html"'s `S` / `DS` / `TONE`
 * consts (see CLAUDE.md's "Getting the real screen source" note).
 *
 * This is wider than the five states CLAUDE.md's design-token note
 * describes (pending / review / verified / rejected / boosted) — `draft`,
 * `action`, `live` and `paused` are portal-specific additions the design
 * introduces for the Vehicles screen, and `verified` here is the separate
 * badge axis rather than a listing status. The design file is the
 * authority for this screen.
 */
import type { VehicleFilter } from "../../lib/vehicles-api.js";
import type { BookingFilter, BookingStatus } from "../../lib/bookings-api.js";
import type { PayoutStatus } from "../../lib/payouts-api.js";

export type VehicleStatus = "draft" | "pending" | "review" | "action" | "rejected" | "live" | "paused";
export type DocReviewState = "ok" | "pending" | "expiring" | "rejected" | "missing";
export type EventTone = "grey" | "blue" | "green" | "amber" | "red";

export const STATUS: Record<VehicleStatus, { label: string; core: string; tint: string; border: string; text: string }> = {
  draft: { label: "Draft", core: "#838C9B", tint: "#F1F3F6", border: "#CDD2DA", text: "#5A6373" },
  pending: { label: "Pending review", core: "#C77400", tint: "#FFF3DB", border: "#F5D9A3", text: "#8A5200" },
  review: { label: "Under review", core: "#0B7BC1", tint: "#E1F1FA", border: "#A9D6EE", text: "#075D93" },
  action: { label: "Action needed", core: "#D81E32", tint: "#FDE7EA", border: "#F7BDC5", text: "#A50E22" },
  rejected: { label: "Rejected", core: "#D81E32", tint: "#FDE7EA", border: "#F7BDC5", text: "#A50E22" },
  live: { label: "Live", core: "#0B8A5B", tint: "#DDF3E9", border: "#A8DEC7", text: "#076945" },
  paused: { label: "Paused by you", core: "#838C9B", tint: "#F1F3F6", border: "#CDD2DA", text: "#5A6373" },
};

export const DOC_STATE: Record<DocReviewState, { core: string; label: string; fg: string }> = {
  ok: { core: "#0B8A5B", label: "ACCEPTED", fg: "#076945" },
  pending: { core: "#C77400", label: "IN REVIEW", fg: "#8A5200" },
  expiring: { core: "#C77400", label: "EXPIRING", fg: "#8A5200" },
  rejected: { core: "#D81E32", label: "REJECTED", fg: "#A50E22" },
  missing: { core: "#CDD2DA", label: "MISSING", fg: "#838C9B" },
};

/**
 * A fourth status vocabulary, after the seven listing states above, the four
 * document review states, and bookings' own set. Literal reads off the
 * design's `PS` const in "Cruz Merchant Bookings & Payouts.dc.html".
 *
 * Only `scheduled` and `paid` are reachable today — `processing` and
 * `failed` are the states a real M-Pesa B2C rail moves through, and are
 * declared now so wiring one later is a service change, not a UI one.
 */
export const PAYOUT_STATUS: Record<PayoutStatus, { label: string; core: string; tint: string; border: string; text: string }> = {
  scheduled: { label: "Scheduled", core: "#C77400", tint: "#FFF3DB", border: "#F5D9A3", text: "#8A5200" },
  processing: { label: "Processing", core: "#0B7BC1", tint: "#E1F1FA", border: "#A9D6EE", text: "#075D93" },
  paid: { label: "Paid", core: "#0B8A5B", tint: "#DDF3E9", border: "#A8DEC7", text: "#076945" },
  failed: { label: "Failed", core: "#D81E32", tint: "#FDE7EA", border: "#F7BDC5", text: "#A50E22" },
};

export const TONE: Record<EventTone, string> = {
  grey: "#CDD2DA",
  blue: "#0B7BC1",
  green: "#0B8A5B",
  amber: "#C77400",
  red: "#D81E32",
};

export const DOC_LABELS: Record<"logbook" | "comprehensive_insurance" | "tracker_certificate", [string, string]> = {
  logbook: ["Logbook", "All pages showing owner and chassis number"],
  tracker_certificate: ["Car tracker certificate", "From your tracking provider, in this vehicle's plate"],
  comprehensive_insurance: ["Comprehensive insurance", "Third-party cover is not accepted"],
};
export const DOC_ORDER: (keyof typeof DOC_LABELS)[] = ["logbook", "tracker_certificate", "comprehensive_insurance"];

export const OWNER_DOC_LABELS: Record<"national_id" | "kra_pin", [string, string]> = {
  national_id: ["National ID · both sides", "Front and back, one file or two photos"],
  kra_pin: ["KRA PIN certificate", "Matching the PIN on your account"],
};
export const OWNER_DOC_ORDER: (keyof typeof OWNER_DOC_LABELS)[] = ["national_id", "kra_pin"];

/**
 * A document sitting at `pending` reads differently depending on whether
 * the *vehicle* has been submitted yet — freshly attached to a still-draft
 * listing, it's just "pending review" (waiting on the merchant to finish
 * and submit); once the whole listing has gone to CRAL it's "in review"
 * (waiting on a reviewer). Every other state's label is fixed.
 */
export function docStateLabel(state: DocReviewState, vehicleStatus: VehicleStatus): string {
  if (state === "pending") return vehicleStatus === "draft" ? "PENDING REVIEW" : "IN REVIEW";
  return DOC_STATE[state].label;
}

const BUCKET_LABEL: Record<VehicleFilter, string> = {
  all: "All",
  awaiting_approval: "Awaiting approval",
  needs_action: "Needs your action",
  live: "Live",
  draft: "Draft",
};

export const FILTER_ORDER: VehicleFilter[] = ["all", "awaiting_approval", "needs_action", "live", "draft"];

export function filterLabel(f: VehicleFilter): string {
  return BUCKET_LABEL[f];
}

export function money(cents: number | null | undefined): string {
  if (!cents) return "—";
  return Math.round(cents / 100).toLocaleString("en-KE");
}

/**
 * A third status vocabulary — bookings are neither the brand's five
 * verification states nor the Vehicles screen's seven listing states.
 * Reuses the *same* quartet hex values as STATUS above (this is the same
 * design system, not a new palette): pending's amber for a fresh request,
 * review's blue for a confirmed-but-not-yet-collected booking, live's
 * green for one out on hire, and a neutral/rejected pairing for the three
 * ways a booking ends without completing.
 */
export const BOOKING_STATUS: Record<BookingStatus, { label: string; core: string; tint: string; border: string; text: string }> = {
  requested: { label: "New request", core: "#C77400", tint: "#FFF3DB", border: "#F5D9A3", text: "#8A5200" },
  confirmed: { label: "Upcoming", core: "#0B7BC1", tint: "#E1F1FA", border: "#A9D6EE", text: "#075D93" },
  active: { label: "On hire", core: "#0B8A5B", tint: "#DDF3E9", border: "#A8DEC7", text: "#076945" },
  completed: { label: "Completed", core: "#838C9B", tint: "#F1F3F6", border: "#CDD2DA", text: "#5A6373" },
  declined: { label: "Declined", core: "#D81E32", tint: "#FDE7EA", border: "#F7BDC5", text: "#A50E22" },
  expired: { label: "Expired", core: "#838C9B", tint: "#F1F3F6", border: "#CDD2DA", text: "#5A6373" },
  cancelled: { label: "Cancelled", core: "#D81E32", tint: "#FDE7EA", border: "#F7BDC5", text: "#A50E22" },
};

const BOOKING_BUCKET_LABEL: Record<BookingFilter, string> = {
  all: "All",
  requests: "Requests",
  upcoming: "Upcoming",
  on_hire: "On hire",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const BOOKING_FILTER_ORDER: BookingFilter[] = ["all", "requests", "upcoming", "on_hire", "completed", "cancelled"];

export function bookingFilterLabel(f: BookingFilter): string {
  return BOOKING_BUCKET_LABEL[f];
}

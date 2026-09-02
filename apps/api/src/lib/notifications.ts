import type { Knex } from "knex";
import { generateId } from "./ids.js";
import type {
  NotificationCategory,
  NotificationKind,
  NotificationRow,
  NotificationSubjectType,
} from "../modules/notifications/db-types.js";

/**
 * Writing a notification.
 *
 * `notify(trx, {...})` is shaped exactly like `lib/audit.ts#writeAuditEntry`
 * and is called the same way: **inside the transaction that caused the
 * event**, so a notification row can never claim something the database
 * rolled back.
 *
 * It writes the in-app feed row only. SMS/email delivery is a separate,
 * post-commit step — an SMS round-trip must not sit inside a booking's
 * transaction, and a failed send must not roll the notification back. The
 * caller enqueues delivery with `jobs/notification-delivery.ts`'s
 * `enqueueNotificationDelivery` once the transaction has committed, passing
 * the ids `notify` returned.
 */

// ---------------------------------------------------------------------
// The two taxonomies, reconciled
// ---------------------------------------------------------------------

/**
 * The feed's four `KIND` groups — icon, tint, border, text, filter group.
 * Literal reads off "Cruz Merchant Notifications.dc.html"'s `KIND` const.
 * Mirrored client-side in
 * `apps/merchant/src/components/portal/status.ts#NOTIFICATION_KIND` — keep
 * the two in step.
 */
export const NOTIFICATION_KIND: Record<
  NotificationKind,
  { icon: string; tint: string; border: string; text: string; group: string }
> = {
  hire: { icon: "H", tint: "#EDEFFC", border: "#C3CBF5", text: "#0F23A8", group: "Bookings" },
  money: { icon: "KES", tint: "#DDF3E9", border: "#A8DEC7", text: "#076945", group: "Money" },
  doc: { icon: "D", tint: "#FDE7EA", border: "#F7BDC5", text: "#A50E22", group: "Documents" },
  rate: { icon: "★", tint: "#FFF3DB", border: "#F5D9A3", text: "#8A5200", group: "Ratings" },
};

/**
 * `category` drives the merchant's channel preferences; `kind` drives the
 * feed's pills and icon. The design leaves this mapping implicit — these
 * are the pairings its own fixtures use.
 */
const CATEGORY_TO_KIND: Record<NotificationCategory, NotificationKind> = {
  booking: "hire",
  return: "hire",
  payout: "money",
  review: "doc",
  expiry: "doc",
  rating: "rate",
};

export function kindForCategory(category: NotificationCategory): NotificationKind {
  return CATEGORY_TO_KIND[category];
}

// ---------------------------------------------------------------------
// Category metadata — labels, default channels, locks
// ---------------------------------------------------------------------

export interface CategoryMeta {
  label: string;
  body: string;
  /** Built-in default when the merchant has no preference row for this category. */
  default: { sms: boolean; email: boolean };
  /** Channels the merchant cannot switch off — always sent, per the design. */
  locked: Array<"sms" | "email">;
}

/**
 * The five rows the Settings "Alerts" design shows, in its order, with its
 * exact copy and default toggles — plus `rating`, which the design's Alerts
 * matrix omits even though the feed shows rating notifications (owner's
 * call: add it as a real category). `rating` defaults to email-on / sms-off
 * — a rating prompts a rate-back but isn't money-urgent, so it follows the
 * 2026-08-24 "everything that isn't a 2FA challenge goes by email" line
 * rather than reaching for SMS.
 *
 * The design's `tips` row ("CRAL news and pricing tips") is deliberately
 * omitted — nothing in this product generates it. Flagged alongside
 * WhatsApp in CLAUDE.md.
 */
export const NOTIFICATION_CATEGORIES: Record<NotificationCategory, CategoryMeta> = {
  booking: {
    label: "New booking request",
    body: "A hirer asks for one of your vehicles.",
    default: { sms: true, email: false },
    locked: [],
  },
  payout: {
    label: "Payout sent",
    body: "Money has left CRAL for your M-Pesa.",
    default: { sms: true, email: true },
    locked: ["sms"],
  },
  review: {
    label: "Reviewer note on a vehicle",
    body: "Something on a listing needs fixing.",
    default: { sms: true, email: true },
    locked: ["sms"],
  },
  expiry: {
    label: "Insurance or inspection expiring",
    body: "Thirty days before cover lapses.",
    default: { sms: true, email: true },
    locked: [],
  },
  return: {
    label: "Vehicle returned and checked",
    body: "The handover check is done.",
    default: { sms: false, email: false },
    locked: [],
  },
  rating: {
    label: "Hirer rated you",
    body: "A hirer left a rating on a finished hire.",
    default: { sms: false, email: true },
    locked: [],
  },
};

export const NOTIFICATION_CATEGORY_ORDER: NotificationCategory[] = [
  "booking",
  "payout",
  "review",
  "expiry",
  "return",
  "rating",
];

/** Categories that always send by SMS regardless of preference or quiet hours. */
export function categoryLocksSms(category: NotificationCategory): boolean {
  return NOTIFICATION_CATEGORIES[category].locked.includes("sms");
}

/** Categories that ignore quiet hours entirely (per the design: payout + reviewer). */
export function categoryBypassesQuietHours(category: NotificationCategory): boolean {
  return category === "payout" || category === "review";
}

// ---------------------------------------------------------------------
// notify()
// ---------------------------------------------------------------------

export interface NotifyInput {
  merchantId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** The plated reference shown on the row, e.g. "CB-2841". */
  ref?: string | null;
  /** Deep-link target for the row's CTA. Omit both for a merchant-level notice. */
  subjectType?: NotificationSubjectType | null;
  subjectId?: string | null;
  /** When the event happened. Defaults to now. */
  occurredAt?: Date;
}

/**
 * Inserts one `notifications` row on `trx` and returns its id. `kind` is
 * derived from `category`; never pass it in.
 */
export async function notify(trx: Knex.Transaction | Knex, input: NotifyInput): Promise<string> {
  const id = generateId("notification");
  await trx<NotificationRow>("notifications").insert({
    id,
    merchant_id: input.merchantId,
    category: input.category,
    kind: kindForCategory(input.category),
    title: input.title,
    body: input.body,
    ref: input.ref ?? null,
    subject_type: input.subjectType ?? null,
    subject_id: input.subjectId ?? null,
    occurred_at: input.occurredAt ?? new Date(),
  });
  return id;
}

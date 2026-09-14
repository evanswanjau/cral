import { apiGet, apiPost } from "./api.js";

/**
 * A renter's own notification feed. Typed client for
 * `openapi/customer-notifications.yaml` - the renter-scoped mirror of the
 * merchant portal's `lib/notifications-api.ts` (C8, Migration B). No
 * preferences client here - there's no renter Settings screen yet to
 * configure a channel choice.
 */

export type NotificationKind = "hire" | "money" | "doc" | "rate";
export type NotificationCategory =
  | "booking"
  | "payout"
  | "review"
  | "expiry"
  | "return"
  | "rating";

export type NotificationFilter =
  | "all"
  | "unread"
  | "bookings"
  | "money"
  | "documents"
  | "ratings";

export interface NotificationRow {
  id: string;
  category: NotificationCategory;
  kind: NotificationKind;
  group: string;
  icon: string;
  title: string;
  body: string;
  ref: string | null;
  subject_type: "booking" | "vehicle" | "payout_run" | "merchant" | null;
  subject_id: string | null;
  occurred_at: string;
  read: boolean;
  cta?: string;
  cta_href?: string;
}

export interface NotificationCounts {
  all: number;
  unread: number;
  bookings: number;
  money: number;
  documents: number;
  ratings: number;
}

export interface NotificationListResult {
  data: NotificationRow[];
  next_cursor: string | null;
  has_more: boolean;
  counts: NotificationCounts;
  unread: number;
  urgent: NotificationRow | null;
}

export function listMyNotifications(
  params: { filter?: NotificationFilter; cursor?: string; limit?: number } = {},
) {
  const q = new URLSearchParams();
  if (params.filter) q.set("filter", params.filter);
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiGet<NotificationListResult>(`/me/notifications${qs ? `?${qs}` : ""}`);
}

export function markMyNotificationRead(id: string) {
  return apiPost<{ unread: number }>(`/me/notifications/${id}/read`);
}

export function markAllMyNotificationsRead() {
  return apiPost<{ marked: number; unread: number }>("/me/notifications/read-all");
}

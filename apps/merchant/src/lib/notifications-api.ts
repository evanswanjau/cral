import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./api.js";

/**
 * Merchant Notifications - the feed, its filters, mark-read, and the
 * category x channel preference matrix. Mirrors `lib/payouts-api.ts`.
 *
 * Two axes, same as the API (see openapi/merchant-notifications.yaml):
 * `kind` drives the filter pills and the row icon; `category` drives the
 * merchant's channel preferences.
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
  /** Present only when the row deep-links somewhere. */
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

export interface NotificationPreferenceRow {
  category: NotificationCategory;
  label: string;
  body: string;
  kind: NotificationKind;
  sms: boolean;
  email: boolean;
  locked: Array<"sms" | "email">;
}

export interface QuietHours {
  enabled: boolean;
  from: string;
  until: string;
}

export interface NotificationPreferences {
  categories: NotificationPreferenceRow[];
  quiet_hours: QuietHours;
}

export const FILTER_ORDER: NotificationFilter[] = [
  "all",
  "unread",
  "bookings",
  "money",
  "documents",
  "ratings",
];

export const FILTER_LABEL: Record<NotificationFilter, string> = {
  all: "All",
  unread: "Unread",
  bookings: "Bookings",
  money: "Money",
  documents: "Documents",
  ratings: "Ratings",
};

// ---------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------

export function listNotifications(filter: NotificationFilter, limit?: number) {
  const query = limit === undefined ? `filter=${filter}` : `filter=${filter}&limit=${limit}`;
  return apiGet<NotificationListResult>(`/merchant/notifications?${query}`);
}

export function markNotificationRead(id: string) {
  return apiPost<{ unread: number }>(`/merchant/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return apiPost<{ marked: number; unread: number }>("/merchant/notifications/read-all");
}

export function getNotificationPreferences() {
  return apiGet<NotificationPreferences>("/merchant/notification-preferences");
}

export function updateNotificationPreferences(body: {
  categories: Array<{ category: NotificationCategory; sms: boolean; email: boolean }>;
  quiet_hours: { enabled: boolean; from: string | null; until: string | null };
}) {
  return apiPut<NotificationPreferences>("/merchant/notification-preferences", body);
}

export function seedDevNotifications() {
  return apiPost<{ seeded: number }>("/merchant/notifications/dev-seed");
}

// ---------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------

export function useNotificationList(filter: NotificationFilter) {
  return useQuery({
    queryKey: ["notifications", filter],
    queryFn: () => listNotifications(filter),
  });
}

/**
 * The SideNav badge, so it mounts on every portal screen. Its own query key
 * keeps it fresh independently of whichever filter the Notifications screen
 * is showing - but that also means it is a *second* request alongside that
 * screen's own feed, so it asks for `limit=1`: all it reads is the `unread`
 * total, and the contract computes counts over the whole feed rather than
 * the returned page.
 */
export function useNotificationUnread() {
  return useQuery({
    queryKey: ["notifications-unread"],
    queryFn: () => listNotifications("all", 1),
    select: (result) => result.unread,
  });
}

function invalidateFeed(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => invalidateFeed(queryClient),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => invalidateFeed(queryClient),
  });
}

export function useNotificationPreferences() {
  return useQuery({ queryKey: ["notification-preferences"], queryFn: getNotificationPreferences });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: (data) => {
      queryClient.setQueryData(["notification-preferences"], data);
    },
  });
}

export function useSeedDevNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: seedDevNotifications,
    onSuccess: () => invalidateFeed(queryClient),
  });
}

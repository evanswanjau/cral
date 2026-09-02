import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";
import type { NotificationCategory } from "./db-types.js";

/**
 * The feed filter. `all` / `unread` are cross-cutting; the rest name one of
 * the four feed `kind` groups (see the design's `FILTERS` const:
 * "All · Unread · Bookings · Money · Documents · Ratings").
 */
export const NotificationFilterSchema = z.enum([
  "all",
  "unread",
  "bookings",
  "money",
  "documents",
  "ratings",
]);
export type NotificationFilter = z.infer<typeof NotificationFilterSchema>;

export const ListNotificationsQuerySchema = PaginationQuerySchema.extend({
  filter: NotificationFilterSchema.default("all"),
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;

const CATEGORY_KEYS = [
  "booking",
  "payout",
  "review",
  "expiry",
  "return",
  "rating",
] as const satisfies readonly NotificationCategory[];

/**
 * The Settings matrix payload: a channel row per category, plus the
 * quiet-hours block. A locked channel that arrives switched off is rejected
 * (422 `channel_locked`) rather than silently coerced — the design shows
 * the toggle as visibly locked, so an attempt to clear it is a client bug
 * worth surfacing.
 */
export const UpdateNotificationPreferencesSchema = z.object({
  categories: z
    .array(
      z.object({
        category: z.enum(CATEGORY_KEYS),
        sms: z.boolean(),
        email: z.boolean(),
      }),
    )
    .min(1),
  quiet_hours: z.object({
    enabled: z.boolean(),
    from: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Give the time as HH:MM.")
      .nullable(),
    until: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Give the time as HH:MM.")
      .nullable(),
  }),
});
export type UpdateNotificationPreferencesInput = z.infer<typeof UpdateNotificationPreferencesSchema>;

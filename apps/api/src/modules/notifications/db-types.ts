/**
 * Row shapes for the merchant Notifications slice. See the migration
 * (20260902090000_create_notifications.ts) for why `category` and `kind`
 * are two separate axes.
 */

export type NotificationCategory =
  | "booking"
  | "payout"
  | "review"
  | "expiry"
  | "return"
  | "rating";

/** The feed's four icon/filter groups. */
export type NotificationKind = "hire" | "money" | "doc" | "rate";

export type NotificationSubjectType = "booking" | "vehicle" | "payout_run" | "merchant";

export interface NotificationRow {
  id: string;
  merchant_id: string;
  category: NotificationCategory;
  kind: NotificationKind;
  title: string;
  body: string;
  ref: string | null;
  subject_type: NotificationSubjectType | null;
  subject_id: string | null;
  occurred_at: Date;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface NotificationPreferenceRow {
  id: string;
  merchant_id: string;
  category: NotificationCategory;
  sms: boolean;
  email: boolean;
  created_at: Date;
  updated_at: Date;
}

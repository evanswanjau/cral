export interface MerchantRow {
  id: string;
  user_id: string;
  owner_type: string;
  company_name: string | null;
  company_cert_no: string | null;
  company_kra: string | null;
  company_email: string | null;
  company_address: string | null;
  /** Listing-facing name when it differs from the registered one (Settings → Business). */
  trading_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  surname: string | null;
  national_id: string | null;
  kra_pin: string | null;
  payout_same: boolean;
  payout_method: string;
  payout_detail: string | null;
  /** Long-booking instalment rhythm — "weekly" | "monthly". Stored, not yet acted on. Always "monthly" for bank. */
  payout_schedule: string;
  /** "Name on the M-Pesa line" (Settings → Payouts). Not collected at onboarding. */
  payout_mpesa_name: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  merchant_terms_accepted_version: string | null;
  merchant_terms_accepted_at: Date | null;
  merchant_terms_accepted_ip: string | null;
  onboarding_step: number;
  /** Furthest step ever reached — drives which stepper tabs stay clickable. */
  onboarding_max_step: number;
  onboarding_screen: string;
  onboarding_submitted: boolean;
  /** Set only once an admin approves the account — nothing does that yet in Phase 1 (no admin portal). */
  approved_at: Date | null;
  /** Notification quiet hours — per-account, not per-category. "HH:MM" Nairobi wall-clock. */
  quiet_hours_enabled: boolean;
  quiet_from: string | null;
  quiet_until: string | null;
  last_activity_at: Date;
  created_at: Date;
  updated_at: Date;
}

export type VehicleStatus = "draft" | "pending" | "review" | "action" | "rejected" | "live" | "paused";
export type VerificationBadgeState = "none" | "pending" | "active";

export interface VehicleRow {
  id: string;
  merchant_id: string;
  type: string;
  make: string;
  model: string;
  year: string;
  registration: string;
  transmission: string;
  fuel: string;
  colour: string | null;
  county: string | null;
  pickup_address: string | null;
  daily_rate_amount: number;
  daily_rate_currency: string;
  /** "list" | "net" - which price view the merchant used (see 20260904090000). Display only. */
  rate_mode: string;
  insurance_expiry: string | null;
  status: VehicleStatus;
  listing_ref: string | null;
  seats: number;
  minimum_hire_days: number;
  chauffeured: boolean;
  submitted_at: Date | null;
  verification_badge: VerificationBadgeState;
  verification_badge_expires_at: Date | null;
  reviewer_note: string | null;
  reviewer_note_meta: string | null;
  reviewer_note_resolved: boolean;
  /** The admin (admin_users.id) this review case is assigned to, or null (PR 2). */
  review_assignee: string | null;
  created_at: Date;
  updated_at: Date;
}

export type DocumentKind =
  | "national_id"
  | "kra_pin"
  | "certificate_of_incorporation"
  | "company_kra_pin"
  | "cr12"
  | "logbook"
  | "comprehensive_insurance"
  | "tracker_certificate"
  | "vehicle_photo"
  | "handover_photo"
  // Renter documents (customer-portal slice). A row with one of these
  // kinds has `user_id` set and `merchant_id` null.
  | "driving_licence";

export type DocumentReviewState = "ok" | "pending" | "expiring" | "rejected";

export interface DocumentRow {
  id: string;
  /** Set for merchant/vehicle documents; null for renter documents (see `user_id`). */
  merchant_id: string | null;
  /** Set for renter documents; null for merchant/vehicle documents. Exactly one of the two is set. */
  user_id: string | null;
  vehicle_id: string | null;
  kind: DocumentKind;
  storage_key: string;
  original_name: string;
  size_bytes: number;
  content_type: string;
  review_state: DocumentReviewState;
  expires_at: string | null;
  /** Set by an admin's Accept/Reject (PR 2). The note is what a rejection quotes to the merchant. */
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type EventTone = "grey" | "blue" | "green" | "amber" | "red";
export type EventActorType = "merchant" | "reviewer" | "system";

export interface VehicleEventRow {
  id: string;
  vehicle_id: string;
  merchant_id: string;
  kind: string;
  tone: EventTone;
  label: string;
  body: string | null;
  actor_type: EventActorType;
  actor_name: string | null;
  occurred_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ProfileChangeRequestRow {
  id: string;
  merchant_id: string;
  requested_by: string;
  status: "pending" | "approved" | "rejected";
  changes: Record<string, unknown>;
  reviewer_id: string | null;
  reviewer_note: string | null;
  decided_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type ReminderTier = "24h" | "3d" | "30d";

export interface MerchantOnboardingReminderRow {
  id: string;
  merchant_id: string;
  tier: ReminderTier;
  sent_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface MerchantRow {
  id: string;
  user_id: string;
  owner_type: string;
  company_name: string | null;
  company_cert_no: string | null;
  company_kra: string | null;
  first_name: string | null;
  middle_name: string | null;
  surname: string | null;
  national_id: string | null;
  kra_pin: string | null;
  county: string | null;
  payout_same: boolean;
  payout_method: string;
  payout_detail: string | null;
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
  last_activity_at: Date;
  created_at: Date;
  updated_at: Date;
}

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
  pickup_address: string | null;
  daily_rate_amount: number;
  daily_rate_currency: string;
  insurance_expiry: string | null;
  created_at: Date;
  updated_at: Date;
}

export type DocumentKind =
  | "national_id"
  | "kra_pin"
  | "logbook"
  | "comprehensive_insurance"
  | "tracker_certificate"
  | "vehicle_photo";

export interface DocumentRow {
  id: string;
  merchant_id: string;
  vehicle_id: string | null;
  kind: DocumentKind;
  storage_key: string;
  original_name: string;
  size_bytes: number;
  content_type: string;
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

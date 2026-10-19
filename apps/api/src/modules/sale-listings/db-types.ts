/** Row shapes for car sales (20261020090000, docs/plans/car-sales.md). */

export type SaleListingStatus =
  | "draft"
  | "pending"
  | "review"
  | "action"
  | "rejected"
  | "live"
  | "paused"
  | "under_offer"
  | "sold"
  | "withdrawn"
  | "expired"
  | "removed";

export interface SaleListingRow {
  id: string;
  seller_user_id: string;
  merchant_id: string | null;
  vehicle_id: string | null;
  ref: string | null;
  category: string;
  make: string;
  model: string;
  year: number;
  registration: string;
  chassis_number: string;
  mileage_km: number;
  engine_cc: number | null;
  transmission: string;
  fuel: string;
  colour: string | null;
  drive: string | null;
  import_status: string;
  /** bigint - node-pg hands it back as a string; read it through `askingPrice()`. */
  asking_price_amount: string | number;
  asking_price_currency: string;
  negotiable: boolean;
  known_faults: string;
  accident_history: string;
  accident_note: string | null;
  encumbered: boolean;
  service_history: string;
  county: string;
  viewing_area: string;
  description: string | null;
  auto_share_contact: boolean;
  status: SaleListingStatus;
  reviewer_note: string | null;
  review_assignee: string | null;
  submitted_at: Date | null;
  decided_at: Date | null;
  live_at: Date | null;
  expires_at: Date | null;
  expiry_reminded_at: Date | null;
  sold_at: Date | null;
  sold_via_cral: boolean | null;
  paused_hire: boolean;
  view_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface SaleReviewCheckRow {
  sale_listing_id: string;
  item_id: string;
  result: "pass" | "flag";
  note: string | null;
  answered_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export type SaleEnquiryStatus = "new" | "replied" | "closed";

export interface SaleEnquiryRow {
  id: string;
  sale_listing_id: string;
  buyer_user_id: string;
  message: string;
  viewing_window: string | null;
  status: SaleEnquiryStatus;
  reply: string | null;
  shared_phone: string | null;
  contact_shared_at: Date | null;
  replied_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type SaleReportReason = "not_available" | "wrong_details" | "scam" | "duplicate" | "other";

export interface SaleListingReportRow {
  id: string;
  sale_listing_id: string;
  reporter_user_id: string;
  reason: SaleReportReason;
  note: string | null;
  status: "open" | "dismissed" | "actioned";
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

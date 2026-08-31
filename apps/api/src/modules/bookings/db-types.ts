export type BookingStatus =
  | "requested"
  | "confirmed"
  | "active"
  | "completed"
  | "declined"
  | "expired"
  | "cancelled";

export interface BookingRow {
  id: string;
  ref: string;
  merchant_id: string;
  vehicle_id: string;
  hirer_id: string;
  status: BookingStatus;
  pickup_at: Date;
  dropoff_at: Date;
  pickup_location: string;
  dropoff_location: string;
  note_from_hirer: string | null;
  gross_amount: number;
  gross_currency: string;
  commission_amount: number;
  commission_currency: string;
  merchant_net_amount: number;
  merchant_net_currency: string;
  deposit_amount: number;
  deposit_currency: string;
  cancellation_fee_amount: number | null;
  cancellation_fee_currency: string | null;
  refund_amount: number | null;
  refund_currency: string | null;
  payout_method: string;
  payout_detail: string;
  payout_account_name: string;
  response_due_at: Date | null;
  decline_reason_code: string | null;
  decline_note: string | null;
  cancel_reason: string | null;
  has_pickup_condition_photos: boolean;
  returned_at: Date | null;
  deposit_release_at: Date | null;
  deposit_released: boolean;
  rating_open_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type HandoverKind = "pickup" | "return";

export type HandoverState =
  | "created"
  | "qr_scanned"
  | "otp_sent"
  | "otp_verified"
  | "condition_logged"
  | "confirmed"
  | "completed"
  | "expired"
  | "failed"
  | "offline_pending"
  | "reconciled";

export interface HandoverRow {
  id: string;
  booking_id: string;
  kind: HandoverKind;
  state: HandoverState;
  otp_code_hash: string | null;
  otp_attempts: number;
  otp_sent_at: Date | null;
  otp_expires_at: Date | null;
  masked_destination: string | null;
  odometer_km: number | null;
  fuel_level: string | null;
  condition_notes: string | null;
  confirmed_at: Date | null;
  completed_at: Date | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export type BookingEventTone = "grey" | "blue" | "green" | "amber" | "red";
export type BookingEventActorType = "merchant" | "hirer" | "system";

export interface BookingEventRow {
  id: string;
  booking_id: string;
  merchant_id: string;
  kind: string;
  tone: BookingEventTone;
  label: string;
  body: string | null;
  actor_type: BookingEventActorType;
  actor_name: string | null;
  occurred_at: Date;
  created_at: Date;
  updated_at: Date;
}

export type BookingReportKind = "claim" | "conduct";
export type BookingReportCategory =
  | "damage"
  | "fuel_short"
  | "late_return"
  | "missing_equipment"
  | "cleaning"
  | "conduct"
  | "other";
export type BookingReportStatus = "filed" | "under_review" | "resolved";

export interface BookingReportRow {
  id: string;
  booking_id: string;
  merchant_id: string;
  kind: BookingReportKind;
  category: BookingReportCategory;
  description: string;
  amount_amount: number | null;
  amount_currency: string | null;
  evidence_document_ids: string[];
  status: BookingReportStatus;
  escalated_dispute_id: string | null;
  created_at: Date;
  updated_at: Date;
}

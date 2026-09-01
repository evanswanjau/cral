/**
 * A fourth status vocabulary, alongside the vehicle-listing (`STATUS`),
 * document (`DOC_STATE`) and booking sets. Values are literal reads off the
 * design's own `PS` const in "Cruz Merchant Bookings & Payouts.dc.html".
 *
 * Only `scheduled` and `paid` are reachable today — `processing` and
 * `failed` are the states a real Daraja B2C rail moves through, declared now
 * so wiring it later is a service change, not a migration.
 */
export type PayoutRunStatus = "scheduled" | "processing" | "paid" | "failed";

export interface PayoutRunRow {
  id: string;
  ref: string;
  merchant_id: string;
  status: PayoutRunStatus;
  /** Nairobi calendar day, stored as a plain date — see the migration's note. */
  run_date: string;
  gross_amount: number;
  gross_currency: string;
  commission_amount: number;
  commission_currency: string;
  net_amount: number;
  net_currency: string;
  destination_method: string;
  destination_detail: string;
  destination_account_name: string;
  /** Safaricom transaction code. Null until the run actually settles. */
  provider_code: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PayoutRunLineRow {
  id: string;
  payout_run_id: string;
  booking_id: string | null;
  booking_ref: string;
  hirer_name: string;
  vehicle_registration: string;
  pickup_at: Date;
  dropoff_at: Date;
  gross_amount: number;
  gross_currency: string;
  commission_amount: number;
  commission_currency: string;
  net_amount: number;
  net_currency: string;
  created_at: Date;
  updated_at: Date;
}

export type PayoutQueryStatus = "filed" | "answered";

export interface PayoutQueryRow {
  id: string;
  payout_run_id: string;
  merchant_id: string;
  message: string;
  status: PayoutQueryStatus;
  response: string | null;
  created_at: Date;
  updated_at: Date;
}

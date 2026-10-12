import { apiGet, apiPost } from "./api.js";

export type PayoutRunStatus = "scheduled" | "processing" | "paid" | "failed";

export interface Money {
  amount: number;
  currency: string;
}

export interface PayoutAttempt {
  id: string;
  status: "pending" | "processing" | "success" | "failed";
  channel: "pesalink" | "internal" | "mpesa";
  destination: string;
  bank_name: string | null;
  bank_code: string | null;
  sent: Money;
  provider_transaction_id: string | null;
  failure_reason: string | null;
  created_at: string;
  sent_at: string | null;
  settled_at: string | null;
}

export interface PayoutRunItem {
  id: string;
  ref: string;
  status: PayoutRunStatus;
  run_date: string;
  merchant: { id: string; name: string };
  net: Money;
  sendable: Money;
  destination: { method: string; detail: string; account_name: string };
  hires: number;
  provider_code: string | null;
  paid_at: string | null;
  created_at: string;
  last_attempt: PayoutAttempt | null;
}

export interface PayoutRunDetail extends PayoutRunItem {
  lines: Array<{
    id: string;
    booking_id: string | null;
    booking_ref: string;
    hirer_name: string;
    vehicle_registration: string;
    pickup_at: string;
    dropoff_at: string;
    gross: Money;
    commission: Money;
    net: Money;
  }>;
  attempts: PayoutAttempt[];
  can_pay: boolean;
}

export interface PayoutRunsResponse {
  data: PayoutRunItem[];
  next_cursor: string | null;
  has_more: boolean;
  counts: Record<PayoutRunStatus, number>;
}

export function fetchPayoutRuns(status: string, cursor?: string) {
  const q = new URLSearchParams({ status });
  if (cursor) q.set("cursor", cursor);
  return apiGet<PayoutRunsResponse>(`/admin/payout-runs?${q.toString()}`);
}

export function fetchPayoutRun(id: string) {
  return apiGet<PayoutRunDetail>(`/admin/payout-runs/${id}`);
}

/**
 * The key comes from the caller, created once per confirm - so a
 * double-click or a retry of the same confirm replays rather than paying
 * twice. (The server's one-live-attempt constraint backs that up.)
 */
export function payPayoutRun(id: string, idempotencyKey: string) {
  return apiPost<PayoutRunDetail>(`/admin/payout-runs/${id}/pay`, {}, { headers: { "Idempotency-Key": idempotencyKey } });
}

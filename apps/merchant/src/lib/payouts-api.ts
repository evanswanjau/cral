import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBlob, apiGet, apiPost } from "./api.js";
import type { Money } from "./bookings-api.js";

export type PayoutStatus = "scheduled" | "processing" | "paid" | "failed";

export interface PayoutDestination {
  method: string;
  detail: string;
  account_name: string;
}

export interface PayoutRunSummary {
  id: string;
  ref: string;
  status: PayoutStatus;
  /** Nairobi calendar day, "YYYY-MM-DD": a banking day, not an instant. */
  run_date: string;
  gross: Money;
  commission: Money;
  net: Money;
  line_count: number;
  provider_code: string | null;
  paid_at: string | null;
}

export interface PayoutRunLine {
  id: string;
  /** Null once a booking has been archived; the line survives it. */
  booking_id: string | null;
  booking_ref: string;
  hirer_name: string;
  vehicle_registration: string;
  pickup_at: string;
  dropoff_at: string;
  gross: Money;
  commission: Money;
  net: Money;
}

export interface PayoutRunDetail extends PayoutRunSummary {
  destination: PayoutDestination;
  lines: PayoutRunLine[];
  footnote: string;
  open_query_count: number;
}

export type PayoutTileKey = "next_payout" | "clearing" | "paid_this_month";

export interface PayoutTile {
  key: PayoutTileKey;
  amount: Money;
  note: string;
}

export interface PayoutSummary {
  tiles: PayoutTile[];
  run_count: number;
  net_total: Money;
  destination: PayoutDestination;
  next_run_date: string | null;
}

export interface PayoutListResult {
  data: PayoutRunSummary[];
  next_cursor: string | null;
  has_more: boolean;
  summary: PayoutSummary;
}

export interface PayoutQuery {
  id: string;
  payout_run_id: string;
  message: string;
  status: "filed" | "answered";
  response: string | null;
  created_at: string;
}

export function listPayouts() {
  return apiGet<PayoutListResult>("/merchant/payouts");
}

export function getPayout(id: string) {
  return apiGet<PayoutRunDetail>(`/merchant/payouts/${id}`);
}

export function listPayoutQueries(id: string) {
  return apiGet<{ data: PayoutQuery[] }>(`/merchant/payouts/${id}/queries`);
}

function idempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createPayoutQuery(id: string, message: string) {
  return apiPost<PayoutQuery>(
    `/merchant/payouts/${id}/queries`,
    { message },
    { headers: { "Idempotency-Key": idempotencyKey() } },
  );
}

export function seedDevPayouts() {
  return apiPost<{ created: number; refs: string[] }>("/merchant/payouts/dev-seed");
}

/**
 * Hands the browser a file. Goes through `apiBlob` rather than a bare link
 * because these endpoints need the bearer header (and the shared
 * 401-refresh-and-retry behind it) — an `<a href>` would send neither and
 * get a 401 page saved to the merchant's Downloads folder.
 */
async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Deferred: revoking synchronously can cancel the download in Safari
    // before it has read the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export async function downloadPayoutReceipt(id: string, ref: string): Promise<void> {
  const blob = await apiBlob(`/merchant/payouts/${id}/receipt`);
  await saveBlob(blob, `${ref}-receipt.pdf`);
}

/** `month` is a Nairobi calendar month, "YYYY-MM". */
export async function downloadStatement(month: string): Promise<void> {
  const blob = await apiBlob(`/merchant/payouts/statement?month=${month}`);
  await saveBlob(blob, `cral-statement-${month}.csv`);
}

// ---------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------

export function usePayoutList() {
  return useQuery({ queryKey: ["payouts"], queryFn: listPayouts });
}

export function usePayout(id: string | undefined) {
  return useQuery({
    queryKey: ["payout", id],
    queryFn: () => getPayout(id as string),
    enabled: Boolean(id),
  });
}

export function usePayoutQueries(id: string | undefined) {
  return useQuery({
    queryKey: ["payout-queries", id],
    queryFn: () => listPayoutQueries(id as string),
    enabled: Boolean(id),
  });
}

export function useCreatePayoutQuery(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => createPayoutQuery(id, message),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payout-queries", id] });
      // open_query_count lives on the detail payload.
      void queryClient.invalidateQueries({ queryKey: ["payout", id] });
    },
  });
}

export function useSeedDevPayouts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: seedDevPayouts,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payouts"] });
    },
  });
}

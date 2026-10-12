import type { PayoutAttempt, PayoutRunStatus } from "../../lib/payouts-api.js";

/**
 * Payout run states in Finance's words. Always a word in the badge, never
 * colour alone. Tints are the console's existing status set (Services,
 * Bookings).
 */
export const RUN_STATUS: Record<PayoutRunStatus, { label: string; bg: string; border: string; fg: string }> = {
  scheduled: { label: "TO PAY", bg: "#FFF3DB", border: "#F5D9A3", fg: "#8A5200" },
  processing: { label: "SENDING", bg: "#EDEFFC", border: "#C3CBF5", fg: "#0F23A8" },
  paid: { label: "PAID", bg: "#DDF3E9", border: "#A8DEC7", fg: "#076945" },
  failed: { label: "FAILED", bg: "#FDE7EA", border: "#F7BDC5", fg: "#A50E22" },
};

export const ATTEMPT_STATUS: Record<PayoutAttempt["status"], string> = {
  pending: "Waiting for the bank's answer",
  processing: "Accepted by the bank, confirming",
  success: "Sent",
  failed: "Failed",
};

export const CHANNEL_LABEL: Record<PayoutAttempt["channel"], string> = {
  mpesa: "Send to M-Pesa",
  pesalink: "Pesalink",
  internal: "Co-op internal transfer",
};

export function money(m: { amount: number; currency: string }): string {
  return `${m.currency} ${(m.amount / 100).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function destinationText(d: { method: string; detail: string; account_name: string }): string {
  return d.method === "bank" ? `Bank account ${d.detail} · ${d.account_name}` : `M-Pesa ${d.detail} · ${d.account_name}`;
}

export function dayText(iso: string): string {
  return new Date(iso.length === 10 ? `${iso}T00:00:00+03:00` : iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Nairobi",
  });
}

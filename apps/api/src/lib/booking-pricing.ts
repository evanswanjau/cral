import { kes, type Money } from "@cral/types";

/**
 * Booking money constants. Config, not hardcoded inline at each call site
 * — see openapi/merchant-bookings.yaml's top-level description for why
 * these are the design's figures rather than the platform spec's (the
 * spec's own quote endpoint uses a 1.5x-daily-rate deposit; the merchant
 * portal design's screenshots are all consistently 15% of gross instead,
 * and that's what shipped here — flagged, not reconciled). No admin
 * console exists yet to make these editable, so this file is deliberately
 * a plain module, not a `platform_rates` DB table nobody can reach.
 */
export const COMMISSION_RATE = 0.1;
export const DEPOSIT_RATE = 0.15;
export const LATE_CANCELLATION_FEE_RATE = 0.25;

export interface BookingPricing {
  gross: Money;
  commission: Money;
  merchantNet: Money;
  deposit: Money;
}

export function computeBookingPricing(dailyRateAmountCents: number, days: number): BookingPricing {
  const grossAmount = Math.round(dailyRateAmountCents * days);
  const commissionAmount = Math.round(grossAmount * COMMISSION_RATE);
  const depositAmount = Math.round(grossAmount * DEPOSIT_RATE);
  return {
    gross: kes(grossAmount),
    commission: kes(commissionAmount),
    merchantNet: kes(grossAmount - commissionAmount),
    deposit: kes(depositAmount),
  };
}

/** Late-cancellation fee (25% of gross); CRAL's commission comes off the fee, the rest is the merchant's. */
export function computeLateCancellationFee(
  grossAmountCents: number,
): { fee: Money; commission: Money; merchantKeeps: Money; refund: Money } {
  const feeAmount = Math.round(grossAmountCents * LATE_CANCELLATION_FEE_RATE);
  const commissionAmount = Math.round(feeAmount * COMMISSION_RATE);
  return {
    fee: kes(feeAmount),
    commission: kes(commissionAmount),
    merchantKeeps: kes(feeAmount - commissionAmount),
    refund: kes(grossAmountCents - feeAmount),
  };
}

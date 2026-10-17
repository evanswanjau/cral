import { COMMISSION_RATE, commissionOn, kes, type Money } from "@cral/types";

// Re-exported so existing `booking-pricing.js` importers keep working; the
// rate itself now lives in @cral/types because the clients need the same
// number and had grown their own copies of it.
export { COMMISSION_RATE };

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
export const DEPOSIT_RATE = 0.15;
export const LATE_CANCELLATION_FEE_RATE = 0.25;

/**
 * Where the car changes hands (owner's call, 2026-10-17). `collect` is the
 * owner's own place, free. The other three are CRAL-set flat fees from the
 * design's booking review step ("Delivery to my address for KES 1,000",
 * "JKIA arrivals for KES 1,500", "Wilson Airport for KES 1,200"), offered
 * only on cars whose owner switched delivery on. One fee covers taking the
 * car there and collecting it back from the same place.
 *
 * The fee is the merchant's - they do the driving - so CRAL's commission is
 * on the hire only, never on the fee.
 */
export const HANDOVER_OPTIONS = ["collect", "address", "jkia", "wilson"] as const;
export type HandoverOption = (typeof HANDOVER_OPTIONS)[number];
export type DeliveryOption = Exclude<HandoverOption, "collect">;

export const DELIVERY_FEES: Record<DeliveryOption, number> = {
  address: 100_000,
  jkia: 150_000,
  wilson: 120_000,
};

export const HANDOVER_LABELS: Record<HandoverOption, string> = {
  collect: "Collect from the owner",
  address: "Delivery to my address",
  jkia: "JKIA arrivals",
  wilson: "Wilson Airport",
};

export function deliveryFeeFor(option: HandoverOption): number {
  return option === "collect" ? 0 : DELIVERY_FEES[option];
}

/** The handover choice as both the renter and the owner see it on a booking. */
export function serializeHandoverChoice(b: {
  handover_option: string;
  delivery_address: string | null;
  delivery_fee_amount: number;
}): { option: HandoverOption; label: string; address: string | null; fee: Money } {
  const option = (HANDOVER_OPTIONS as readonly string[]).includes(b.handover_option)
    ? (b.handover_option as HandoverOption)
    : "collect";
  return { option, label: HANDOVER_LABELS[option], address: b.delivery_address, fee: kes(b.delivery_fee_amount) };
}

export interface BookingPricing {
  /** The hire alone - what commission is taken on. */
  hire: Money;
  deliveryFee: Money;
  /** What the renter pays: hire + delivery fee. */
  gross: Money;
  commission: Money;
  merchantNet: Money;
  deposit: Money;
}

export function computeBookingPricing(rateAmountCents: number, quantity: number, deliveryFeeCents = 0): BookingPricing {
  const hireAmount = Math.round(rateAmountCents * quantity);
  const grossAmount = hireAmount + deliveryFeeCents;
  const commissionAmount = commissionOn(hireAmount);
  const depositAmount = Math.round(hireAmount * DEPOSIT_RATE);
  return {
    hire: kes(hireAmount),
    deliveryFee: kes(deliveryFeeCents),
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
  const commissionAmount = commissionOn(feeAmount);
  return {
    fee: kes(feeAmount),
    commission: kes(commissionAmount),
    merchantKeeps: kes(feeAmount - commissionAmount),
    refund: kes(grossAmountCents - feeAmount),
  };
}

/**
 * CRAL's commission on a completed booking, and the arithmetic around it.
 *
 * Shared because this number had drifted into four copies - the API's
 * `booking-pricing.ts`, the merchant `RateField`, the merchant onboarding
 * Vehicles step, and the customer "list your car" calculator - in three
 * different shapes (0.1 and 10). The API is still the only thing that
 * computes money which actually moves; the clients use these for estimates
 * and previews. But an estimate that disagrees with the invoice is its own
 * kind of broken, which is what a second copy of a rate eventually buys.
 *
 * Deliberately unit-agnostic: the API works in integer cents, the clients
 * in whole shillings, and the rounding is the same either way. Pass one
 * unit consistently.
 *
 * `DEPOSIT_RATE` and `LATE_CANCELLATION_FEE_RATE` stay server-side in
 * `apps/api/src/lib/booking-pricing.ts` - no client computes them, and the
 * deposit in particular is deliberately never shown to a merchant.
 */
export const COMMISSION_RATE = 0.1;

/** Whole-percent form, for copy like "CRAL fee (10%)". */
export const COMMISSION_PERCENT = COMMISSION_RATE * 100;

/** What CRAL keeps from a gross amount. */
export function commissionOn(gross: number): number {
  return Math.round(gross * COMMISSION_RATE);
}

/** Gross (what the hirer pays) -> the merchant's take-home. */
export function netFromGross(gross: number): number {
  return gross > 0 ? gross - commissionOn(gross) : 0;
}

/** Take-home -> the gross a hirer must be charged to produce it. */
export function grossFromNet(net: number): number {
  return net > 0 ? Math.round(net / (1 - COMMISSION_RATE)) : 0;
}

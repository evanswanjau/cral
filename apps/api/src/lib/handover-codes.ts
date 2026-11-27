/**
 * The pickup code's shape, shared by the merchant's handover
 * (`modules/bookings/service.ts`), the driver's job SMS
 * (`jobs/driver-job-sms.ts`) and the renter's entry of a driver's code
 * (`modules/customer-bookings/service.ts`), so the three can't drift.
 */

/** Read aloud in person, so short; the attempt cap is what keeps it safe. */
export const PICKUP_CODE_DIGITS = 4;

/** Wrong guesses before a code is spent and a new one is needed. */
export const OTP_MAX_ATTEMPTS = 5;

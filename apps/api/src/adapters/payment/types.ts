export interface StkPushInput {
  /** E.164, e.g. +254712345678. */
  phone: string;
  /** Integer cents — converted to whole KES shillings at the adapter boundary (M-Pesa has no sub-shilling unit). */
  amountCents: number;
  /** What shows in the STK prompt / statement line, e.g. a booking ref. */
  accountReference: string;
  transactionDesc: string;
}

export interface StkPushResult {
  /** Opaque id the provider uses to correlate the async callback with this push. */
  providerRequestId: string;
  /** Human-readable status from the initiate call itself (not the eventual payment result). */
  responseDescription: string;
}

export interface PaymentAdapter {
  /** Prompts the payer's phone. The actual payment result arrives later via the provider's callback, not the return value. */
  initiateStkPush(input: StkPushInput): Promise<StkPushResult>;
}

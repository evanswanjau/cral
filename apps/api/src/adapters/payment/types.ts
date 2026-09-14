export interface StkPushInput {
  /**
   * OUR OWN correlator, generated before the call — Co-op's confirmed
   * `MessageReference` field (max 27 chars). Unlike Daraja's
   * `CheckoutRequestID` (provider-issued), this is a value we choose, pass
   * to the provider, and get echoed back verbatim in both the synchronous
   * ack and the async callback — so the callback handler matches on this,
   * never on anything the provider returns.
   */
  messageReference: string;
  /** E.164, e.g. +254712345678. */
  phone: string;
  /** Integer cents — converted to whole KES shillings at the adapter boundary (M-Pesa has no sub-shilling unit). */
  amountCents: number;
  /** What shows in the STK prompt / statement line, e.g. a booking ref. Co-op's `TransactionNarration`, max 30 chars. */
  narration: string;
}

export interface StkPushResult {
  /** The provider's own posting reference for this leg (Co-op's `TelcoRef`) — informational only, kept for audit trails. `messageReference` is what correlates the eventual callback, not this. */
  providerRef: string;
  /** Human-readable status from the initiate call itself (not the eventual payment result). */
  responseDescription: string;
}

export interface PaymentAdapter {
  /** Prompts the payer's phone. The actual payment result arrives later via the provider's callback, not the return value. */
  initiateStkPush(input: StkPushInput): Promise<StkPushResult>;
}

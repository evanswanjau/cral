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
  /**
   * Which value ends up in `payment_requests.provider_request_id`, and so
   * what the eventual callback is matched on.
   *
   * - `"ours"` - the `messageReference` we generated and sent. Co-op
   *   echoes it back verbatim, so nothing depends on a provider-issued
   *   id. Preferred where a provider supports it.
   * - `"provider"` - the id the provider hands back from the initiate
   *   call (`StkPushResult.providerRef`). Daraja gives us no echo field,
   *   so its `CheckoutRequestID` is the only correlator available.
   *
   * `initiatePayment` reads this to decide whether to re-stamp the row
   * after the push returns. It is a property of the wire protocol, not a
   * preference - don't change one without changing that adapter's
   * `parseCallback` to match.
   */
  readonly correlatesOn: "ours" | "provider";
  /** Prompts the payer's phone. The actual payment result arrives later via the provider's callback, not the return value. */
  initiateStkPush(input: StkPushInput): Promise<StkPushResult>;
  /**
   * Sends a settled payment back to the payer.
   *
   * A renter pays after acceptance (2026-09-21), so the usual reason to
   * refund is a merchant cancelling a booking they were already paid
   * for - plus anything taken under the brief pay-first flow. An adapter
   * that cannot do this must throw rather than resolve -
   * a refund that silently no-ops is worse than one that fails loudly,
   * because the booking row would record a refund that never happened.
   */
  refund(input: RefundInput): Promise<RefundResult>;
  /**
   * Reduces this provider's callback body to `ParsedCallback`, or returns
   * null when the payload isn't one this adapter recognises. Null is not
   * an error: each provider has its own callback URL, and a body arriving
   * at the wrong one (or from a provider that is no longer the configured
   * rail) must be ignored, not made to throw.
   */
  parseCallback(body: unknown): ParsedCallback | null;
}

export interface RefundInput {
  /** Our own correlator, same role as `StkPushInput.messageReference`. */
  messageReference: string;
  /** E.164 destination - the line the original payment came from. */
  phone: string;
  /** Integer cents. Never more than the original payment. */
  amountCents: number;
  /** Statement line, e.g. "Refund CB-2841". */
  narration: string;
  /** The provider's receipt for the payment being reversed, where we have one. */
  originalReceipt: string | null;
}

export interface RefundResult {
  providerRef: string;
  responseDescription: string;
}

/**
 * One provider's async result callback, reduced to the only facts the
 * settle rules in `modules/payments/service.ts#handleCallback` care about.
 *
 * Parsing lives on the adapter, not in the service, because every
 * provider's wire format differs - Co-op echoes our own
 * `MessageReference` at the top level, Daraja nests its own
 * `CheckoutRequestID` under `Body.stkCallback`. The service applies one
 * copy of the settle rules to whatever comes back; a second copy of those
 * rules per provider is how two rails drift apart, the same reasoning
 * `cutPayoutRun` is kept as the single source of what a payout contains.
 */
export interface ParsedCallback {
  /**
   * Matches `payment_requests.provider_request_id`. Whether this is a
   * value we generated or one the provider issued is the adapter's
   * business - see each adapter's own note, they differ.
   */
  reference: string;
  succeeded: boolean;
  /** The real M-Pesa receipt, when the provider sends one. */
  receipt: string | null;
  /** Provider's own words for why it failed - shown to the renter as-is. */
  failureReason: string | null;
  /**
   * Whole shillings the provider says were taken, when it reports them.
   * The service checks this against what it asked for and refuses to
   * settle a mismatch - a forged callback that names a real reference
   * shouldn't be able to mark a booking paid for the wrong figure.
   */
  amountShillings: number | null;
}

/**
 * Sending money out: merchant payouts and renter refunds. Kept apart from
 * `PaymentAdapter` (money coming in) because the rails differ - an STK
 * push is Safaricom prompting a phone; a payout is a bank transfer from
 * CRAL's own account - and so do the failure modes.
 */

export type DisbursementChannel = "pesalink" | "internal" | "mpesa";

export interface DisbursementInput {
  /** Our correlator (<=27 chars), echoed in the ack, the callback and Transaction Status. */
  messageReference: string;
  channel: DisbursementChannel;
  /** Account number (pesalink/internal) or E.164 phone (mpesa). */
  destination: string;
  /** Pesalink only. */
  bankCode: string | null;
  /** Whole shillings - Co-op's transfer APIs take integers. */
  amountShillings: number;
  /** Statement line, <=25 chars on Co-op's side. */
  narration: string;
}

/**
 * What the send call itself said. `accepted` is not the result - the
 * money's fate arrives later on the callback or via Transaction Status.
 *
 * - `accepted: true`  - the provider took the request; wait for the result.
 * - `accepted: false` - the provider refused it outright; nothing moved.
 */
export interface DisbursementAck {
  accepted: boolean;
  description: string;
  raw: unknown;
  /**
   * Set when the ack already carries the final result (the console
   * adapter, which has no callback to wait for).
   */
  result?: DisbursementResult;
}

/** The final result for one attempt, from a callback or a status lookup. */
export interface DisbursementResult {
  reference: string;
  succeeded: boolean;
  /** Co-op's processed transaction number / M-Pesa receipt. */
  transactionId: string | null;
  failureReason: string | null;
}

export interface DisbursementAdapter {
  /** Stored on the row, e.g. "coopbank". */
  readonly provider: string;
  /**
   * Sends one transfer. Throws when there is no usable answer (network,
   * gateway redirect) - the caller must treat that as "unknown", not
   * "failed", because the money may have moved.
   */
  send(input: DisbursementInput): Promise<DisbursementAck>;
  /** Final result if the provider has one, null while unknown. Throws like `send`. */
  queryStatus(messageReference: string): Promise<DisbursementResult | null>;
}

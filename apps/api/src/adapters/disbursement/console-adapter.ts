import { ulid } from "ulid";
import type { DisbursementAck, DisbursementAdapter, DisbursementInput, DisbursementResult } from "./types.js";

/**
 * Dev/test adapter: logs instead of moving money, and reports success at
 * once since there is no callback to wait for. `lib/disbursements.ts`
 * refuses to use it in production - a console "payout" there would mark a
 * merchant paid with nothing sent.
 */
export class ConsoleDisbursementAdapter implements DisbursementAdapter {
  readonly provider = "console";

  async send(input: DisbursementInput): Promise<DisbursementAck> {
    const transactionId = `console_${ulid()}`;
    // eslint-disable-next-line no-console
    console.log(
      `[disbursement:console] ${input.channel} to=${input.destination}${input.bankCode ? ` bank=${input.bankCode}` : ""} amount=KES${input.amountShillings} narration=${input.narration} ref=${input.messageReference} -> ${transactionId}`,
    );
    return {
      accepted: true,
      description: "Sent (console)",
      raw: { console: true },
      result: { reference: input.messageReference, succeeded: true, transactionId, failureReason: null },
    };
  }

  async queryStatus(_messageReference: string): Promise<DisbursementResult | null> {
    return null;
  }
}

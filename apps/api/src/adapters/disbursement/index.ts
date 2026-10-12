import type { DisbursementAdapter } from "./types.js";
import { ConsoleDisbursementAdapter } from "./console-adapter.js";
import { CoopBankDisbursementAdapter } from "./coopbank-adapter.js";

export type { DisbursementAdapter, DisbursementInput, DisbursementAck, DisbursementResult, DisbursementChannel } from "./types.js";

/**
 * Provider chosen by DISBURSEMENT_ADAPTER, same pattern as PAYMENT_ADAPTER.
 * "console" (default) logs; "coopbank" sends through Co-op Connect.
 */
export function createDisbursementAdapter(): DisbursementAdapter {
  const kind = process.env.DISBURSEMENT_ADAPTER ?? "console";
  switch (kind) {
    case "console":
      return new ConsoleDisbursementAdapter();
    case "coopbank":
      return new CoopBankDisbursementAdapter();
    default:
      throw new Error(`Unknown DISBURSEMENT_ADAPTER "${kind}"`);
  }
}

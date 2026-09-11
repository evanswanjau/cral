import type { PaymentAdapter } from "./types.js";
import { ConsolePaymentAdapter } from "./console-adapter.js";
import { CoopBankPaymentAdapter } from "./coopbank-adapter.js";

export type { PaymentAdapter, StkPushInput, StkPushResult } from "./types.js";
export { CoopBankPaymentAdapter } from "./coopbank-adapter.js";

/**
 * Provider chosen by PAYMENT_ADAPTER, same pattern as SMS_ADAPTER /
 * EMAIL_ADAPTER. "console" logs instead of prompting a phone and is the
 * default for local dev and the test run; "coopbank" is the real M-Pesa
 * STK-push rail via Cooperative Bank's gateway.
 */
export function createPaymentAdapter(): PaymentAdapter {
  const kind = process.env.PAYMENT_ADAPTER ?? "console";
  switch (kind) {
    case "console":
      return new ConsolePaymentAdapter();
    case "coopbank":
      return new CoopBankPaymentAdapter();
    default:
      throw new Error(`Unknown PAYMENT_ADAPTER "${kind}"`);
  }
}

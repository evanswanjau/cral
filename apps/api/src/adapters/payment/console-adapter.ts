import { ulid } from "ulid";
import type { PaymentAdapter, StkPushInput, StkPushResult } from "./types.js";

/** Dev/test adapter: logs instead of prompting a real phone. No STK push ever leaves the building. */
export class ConsolePaymentAdapter implements PaymentAdapter {
  async initiateStkPush(input: StkPushInput): Promise<StkPushResult> {
    const providerRef = `console_stk_${ulid()}`;
    // eslint-disable-next-line no-console
    console.log(
      `[payment:console] STK push to=${input.phone} amount=KES${(input.amountCents / 100).toFixed(2)} narration=${input.narration} messageReference=${input.messageReference} providerRef=${providerRef}`,
    );
    return { providerRef, responseDescription: "Success. Request accepted for processing (console)" };
  }
}

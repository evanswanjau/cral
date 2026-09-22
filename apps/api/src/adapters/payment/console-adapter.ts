import { ulid } from "ulid";
import type {
  ParsedCallback,
  PaymentAdapter,
  RefundInput,
  RefundResult,
  StkPushInput,
  StkPushResult,
} from "./types.js";

/** Dev/test adapter: logs instead of prompting a real phone. No STK push ever leaves the building. */
export class ConsolePaymentAdapter implements PaymentAdapter {
  /** Nothing round-trips through a provider, so the reference we generate is the one that comes back. */
  readonly correlatesOn = "ours" as const;

  async initiateStkPush(input: StkPushInput): Promise<StkPushResult> {
    const providerRef = `console_stk_${ulid()}`;
    // eslint-disable-next-line no-console
    console.log(
      `[payment:console] STK push to=${input.phone} amount=KES${(input.amountCents / 100).toFixed(2)} narration=${input.narration} messageReference=${input.messageReference} providerRef=${providerRef}`,
    );
    return { providerRef, responseDescription: "Success. Request accepted for processing (console)" };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const providerRef = `console_refund_${ulid()}`;
    // eslint-disable-next-line no-console
    console.log(
      `[payment:console] refund to=${input.phone} amount=KES${(input.amountCents / 100).toFixed(2)} narration=${input.narration} originalReceipt=${input.originalReceipt ?? "-"} messageReference=${input.messageReference} providerRef=${providerRef}`,
    );
    return { providerRef, responseDescription: "Refund accepted for processing (console)" };
  }

  /**
   * The console adapter has no provider, so it has no wire format to
   * mimic - it takes `ParsedCallback` itself, near enough. The test suite
   * settles payments through this, which is the point: those tests
   * exercise the booking/idempotency plumbing in
   * `modules/payments/service.ts`, and pinning them to whichever
   * provider happens to be live would make an adapter swap look like a
   * plumbing regression. Each real adapter's own parsing is tested
   * against captured provider payloads instead.
   */
  parseCallback(rawBody: unknown): ParsedCallback | null {
    const body = rawBody as Partial<ParsedCallback> | null;
    if (!body || typeof body.reference !== "string" || typeof body.succeeded !== "boolean") {
      return null;
    }
    return {
      reference: body.reference,
      succeeded: body.succeeded,
      receipt: typeof body.receipt === "string" ? body.receipt : null,
      failureReason: typeof body.failureReason === "string" ? body.failureReason : null,
      amountShillings: typeof body.amountShillings === "number" ? body.amountShillings : null,
    };
  }
}

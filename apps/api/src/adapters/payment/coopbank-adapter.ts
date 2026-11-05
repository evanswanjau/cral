import { ApiError } from "@cral/types";
import type {
  ParsedCallback,
  PaymentAdapter,
  StkPushInput,
  StkPushResult,
} from "./types.js";
import { COOP_PATHS, coopPost, requireCoopEnv } from "../coopbank/client.js";

/**
 * Cooperative Bank's Co-op Connect gateway (a WSO2 API Manager) in front
 * of Safaricom's STK push - not a raw Daraja integration.
 *
 * **The request is Co-op's own Postman collection's** ("CRUZ RIDE AUTO
 * LIMITED", received 2026-11-04): `POST /FT/stk/1.0.0` with
 * `MessageReference` (ours, <=27 chars, echoed back - this is what
 * correlates the callback, not anything the provider issues),
 * `CallBackUrl`, `OperatorCode` (CRAL's, `COOPBANK_OPERATOR_CODE` -
 * Co-op resolves the receiving account from it), `TransactionCurrency`,
 * `MobileNumber` (`2547XXXXXXXX`), `Narration`, `Amount` (a NUMBER of
 * whole shillings), `MessageDateTime` and `OtherDetails` name/value
 * pairs. It replaced the public store's "SafaricomSTKPush"
 * (`/stkpush/safaricom/1.0.0`, `TargetMSISDN` / string
 * `TransactionAmount` / `TransactionNarration`), which CRAL is not
 * subscribed to. No shortcode/passkey/timestamp either way.
 *
 * The collection carries no responses. The ack is read as the old API's
 * `{MessageReference, MessageCode, MessageDescription, TelcoRef}`
 * (`MessageCode: "0"` = accepted), and the callback as that shape plus
 * `TransactionID` (the M-Pesa receipt) and an amount under either
 * `TransactionAmount` or `Amount` - check both against the first live
 * push before trusting either.
 *
 * **The callback is authenticated by HTTP Basic** (2026-10-12). The
 * Co-op Connect onboarding form (section 3) has us give Co-op a callback
 * URL plus a username and password "shared separately"; routes.ts checks
 * them (`COOPBANK_CALLBACK_USER`/`_PASSWORD`) and answers 503 in
 * production until they are set. `COOPBANK_STK_PATH_CONFIRMED` still
 * gates the outbound call until a live sandbox push has worked - as of
 * 2026-10-12 every sandbox API call 302s to the gateway's admin login
 * (token issuance works), so that has not happened yet.
 */

/** `+254712345678` -> `254712345678` (Co-op's `MobileNumber` wants no leading `+`). */
function toMsisdn(e164: string): string {
  return e164.replace(/^\+/, "");
}

export class CoopBankPaymentAdapter implements PaymentAdapter {
  /** Co-op echoes our `MessageReference` verbatim in both the ack and the callback. */
  readonly correlatesOn = "ours" as const;

  async initiateStkPush(input: StkPushInput): Promise<StkPushResult> {
    if (process.env.COOPBANK_STK_PATH_CONFIRMED !== "true") {
      throw new ApiError({
        status: 501,
        type: "server_error",
        code: "coopbank_endpoint_unconfirmed",
        message:
          "The Co-op Bank STK-push resource path hasn't been confirmed against their API " +
          "console yet — see the comment at the top of coopbank-adapter.ts. Set " +
          "COOPBANK_STK_PATH_CONFIRMED=true only after updating this file to match their " +
          "documented request shape.",
      });
    }

    const callbackUrl = requireCoopEnv("COOPBANK_CALLBACK_URL");

    const operatorCode = requireCoopEnv("COOPBANK_OPERATOR_CODE");

    // Co-op's collection's request body - see this file's top comment.
    const res = await coopPost(COOP_PATHS.stkPush, {
      MessageReference: input.messageReference,
      CallBackUrl: callbackUrl,
      OperatorCode: operatorCode,
      TransactionCurrency: "KES",
      MobileNumber: toMsisdn(input.phone),
      Narration: input.narration.slice(0, 30),
      // A number of whole shillings - M-Pesa has no sub-shilling unit.
      Amount: Math.round(input.amountCents / 100),
      MessageDateTime: new Date().toISOString(),
      OtherDetails: [{ Name: "MessageReference", Value: input.messageReference }],
    });
    const json = res.body as {
      MessageCode?: string;
      MessageDescription?: string;
      TelcoRef?: string;
    };
    if (res.status >= 400 || json.MessageCode !== "0") {
      throw new Error(
        `Co-op Bank STK push rejected (${res.status}): ${json.MessageDescription ?? JSON.stringify(res.body)}`,
      );
    }

    return {
      providerRef: json.TelcoRef ?? "",
      responseDescription: json.MessageDescription ?? "Accepted",
    };
  }

  /**
   * Co-op's async callback - the same envelope as the sync ack plus
   * `TransactionID` (the real M-Pesa receipt) and, on success,
   * `TransactionAmount`. `MessageReference` is the value WE generated and
   * sent on the initiate call, echoed back verbatim, so it correlates
   * directly to `payment_requests.provider_request_id` without depending
   * on anything the provider issued.
   *
   * Moved here from `modules/payments/service.ts` when the Daraja adapter
   * landed (2026-09-22) - the settle rules stayed in the service, one
   * copy, and only the wire format is per-provider.
   *
   * The route checks HTTP Basic (`COOPBANK_CALLBACK_USER`/`_PASSWORD`)
   * before this runs - see routes.ts.
   */
  parseCallback(rawBody: unknown): ParsedCallback | null {
    return parseCoopBankStkCallback(rawBody);
  }
}

/**
 * The STK result callback's wire format, outside the class so the
 * `/payments/coopbank/callback` route can read Co-op's callbacks whatever
 * `PAYMENT_ADAPTER` is. Dev runs Daraja for the demo and still has to
 * accept Co-op's test callbacks on the URL registered with them.
 */
export function parseCoopBankStkCallback(rawBody: unknown): ParsedCallback | null {
  const body = rawBody as {
    MessageReference?: unknown;
    MessageCode?: unknown;
    MessageDescription?: unknown;
    TransactionID?: unknown;
    TransactionAmount?: unknown;
    Amount?: unknown;
  } | null;
  if (typeof body?.MessageReference !== "string" || typeof body?.MessageCode !== "string") {
    return null;
  }
  const succeeded = body.MessageCode === "0";
  const description = typeof body.MessageDescription === "string" ? body.MessageDescription : null;
  // A string in the old SafaricomSTKPush schema; the FT/stk request sends
  // a number as `Amount`, and its callback is undocumented - read either.
  const amount = Number(body.TransactionAmount ?? body.Amount);
  return {
    reference: body.MessageReference,
    succeeded,
    receipt: typeof body.TransactionID === "string" && body.TransactionID ? body.TransactionID : null,
    failureReason: succeeded ? null : description,
    amountShillings: Number.isFinite(amount) && amount > 0 ? amount : null,
  };
}

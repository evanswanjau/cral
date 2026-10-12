import { ApiError } from "@cral/types";
import type {
  ParsedCallback,
  PaymentAdapter,
  StkPushInput,
  StkPushResult,
} from "./types.js";
import { coopPost, requireCoopEnv } from "../coopbank/client.js";

/**
 * Cooperative Bank's OpenAPI developer portal (developer.co-opbank.co.ke),
 * a WSO2 API Manager instance subscribing this app to their
 * "SafaricomSTKPush" API (context `/stkpush/safaricom/1.0.0`) — Co-op's own
 * gateway in front of Safaricom Daraja's STK push, not a raw Daraja
 * integration.
 *
 * **The request/response shape below is confirmed** — pulled directly
 * from the portal's own OpenAPI document for this resource (2026-09-14),
 * not guessed. It is deliberately NOT Daraja-shaped: no `BusinessShortCode`
 * / `Password` / `Timestamp` — Co-op's proxy computes all of that
 * server-side against the app's own registration. The real request is
 * five fields: `MessageReference` (ours, ≤27 chars, echoed back verbatim
 * in both the sync ack and the async callback — this is what correlates
 * the callback, not anything the provider issues), `TargetMSISDN` (≤12
 * chars — our normalised `2547XXXXXXXX` fits exactly), `CallBackUrl`,
 * `TransactionAmount` (a STRING, ≤7 digits), `TransactionNarration`
 * (≤30 chars). The sync response is `{MessageReference, MessageDateTime,
 * MessageCode, MessageDescription, TelcoRef}` — `MessageCode: "0"` is
 * success. The async callback that lands on `CallBackUrl` is the same
 * shape plus `TransactionID` (the real M-Pesa receipt) and, on success,
 * `TransactionAmount` / `TransactionCompletedDateTime` /
 * `ReceiverPartyPublicName`.
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

/** `+254712345678` -> `254712345678` (Co-op's `TargetMSISDN` wants no leading `+`, and is exactly 12 chars for a normalised Kenyan number). */
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

    // The confirmed request body - see this file's top comment. No
    // shortcode/passkey/timestamp: Co-op's proxy resolves the receiving
    // account from the app's own registration, not from anything in this
    // payload.
    const res = await coopPost("/stkpush/safaricom/1.0.0", {
      MessageReference: input.messageReference,
      TargetMSISDN: toMsisdn(input.phone),
      CallBackUrl: callbackUrl,
      // TransactionAmount is a STRING per the confirmed schema (<=7 digits).
      TransactionAmount: String(Math.round(input.amountCents / 100)),
      TransactionNarration: input.narration.slice(0, 30),
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
  } | null;
  if (typeof body?.MessageReference !== "string" || typeof body?.MessageCode !== "string") {
    return null;
  }
  const succeeded = body.MessageCode === "0";
  const description = typeof body.MessageDescription === "string" ? body.MessageDescription : null;
  // A string in Co-op's schema, same as on the way out.
  const amount = Number(body.TransactionAmount);
  return {
    reference: body.MessageReference,
    succeeded,
    receipt: typeof body.TransactionID === "string" && body.TransactionID ? body.TransactionID : null,
    failureReason: succeeded ? null : description,
    amountShillings: Number.isFinite(amount) && amount > 0 ? amount : null,
  };
}

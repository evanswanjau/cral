import { ApiError } from "@cral/types";
import type {
  ParsedCallback,
  PaymentAdapter,
  RefundInput,
  RefundResult,
  StkPushInput,
  StkPushResult,
} from "./types.js";

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
 * **What is still NOT confirmed: how the callback authenticates itself.**
 * The OpenAPI document has nothing on this — no signature header, no
 * shared secret, no published IP range. `routes.ts`'s callback endpoint
 * still trusts nothing but its own obscurity. `COOPBANK_STK_PATH_CONFIRMED`
 * only gates the request/response shape below being right — it is not a
 * green light to point real money at this. That needs a separate answer
 * (ask Co-op support / the relationship manager directly — it isn't
 * documented) before this ever leaves sandbox.
 */

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cachedToken: CachedToken | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when PAYMENT_ADAPTER=coopbank`);
  return value;
}

function tokenUrl(): string {
  // Sandbox and (once generated) production share this shape; only the
  // host differs, and that's what COOPBANK_TOKEN_URL configures per env.
  return process.env.COOPBANK_TOKEN_URL ?? "https://openapi-sandbox.co-opbank.co.ke/token";
}

function apiBaseUrl(): string {
  return process.env.COOPBANK_API_BASE_URL ?? "https://openapi-sandbox.co-opbank.co.ke";
}

/** WSO2 client-credentials grant. Standard, documented, safe to rely on. */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  const consumerKey = requireEnv("COOPBANK_CONSUMER_KEY");
  const consumerSecret = requireEnv("COOPBANK_CONSUMER_SECRET");
  const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Co-op Bank token request failed: ${res.status} ${res.statusText} — ${text}`);
  }

  let json: { access_token?: string; expires_in?: number };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Co-op Bank token response unparseable: ${text}`);
  }
  if (!json.access_token) {
    throw new Error(`Co-op Bank token response missing access_token: ${text}`);
  }

  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.accessToken;
}

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

    const callbackUrl = requireEnv("COOPBANK_CALLBACK_URL");
    const accessToken = await getAccessToken();

    // The confirmed request body — see this file's top comment. No
    // shortcode/passkey/timestamp: Co-op's proxy resolves the receiving
    // account from the app's own registration, not from anything in this
    // payload.
    const res = await fetch(`${apiBaseUrl()}/stkpush/safaricom/1.0.0`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        MessageReference: input.messageReference,
        TargetMSISDN: toMsisdn(input.phone),
        CallBackUrl: callbackUrl,
        // TransactionAmount is a STRING per the confirmed schema (≤7 digits).
        TransactionAmount: String(Math.round(input.amountCents / 100)),
        TransactionNarration: input.narration.slice(0, 30),
      }),
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Co-op Bank STK push failed: ${res.status} ${res.statusText} — ${text}`);
    }

    let json: {
      MessageReference?: string;
      MessageCode?: string;
      MessageDescription?: string;
      TelcoRef?: string;
    };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Co-op Bank STK response unparseable: ${text}`);
    }
    if (json.MessageCode !== "0") {
      throw new Error(`Co-op Bank STK push rejected: ${json.MessageDescription ?? text}`);
    }

    return {
      providerRef: json.TelcoRef ?? "",
      responseDescription: json.MessageDescription ?? "Accepted",
    };
  }

  /**
   * NOT IMPLEMENTED, and deliberately throwing rather than resolving.
   *
   * A renter pays only after the owner accepts (2026-09-21), so CRAL no
   * longer holds money against an undecided request - but a merchant who
   * cancels a booking they were already paid for still owes it back.
   * Co-op's portal exposes no reversal API we have confirmed - the same "unconfirmed resource path" problem that
   * still gates the STK push above, only with worse consequences if
   * guessed at.
   *
   * It throws so the failure is loud and the refund row is marked
   * `failed` for a human to settle by hand. A silent success here would
   * mark a booking refunded while the renter's money sat with us.
   */
  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new ApiError({
      status: 501,
      type: "server_error",
      code: "coopbank_refund_unavailable",
      message:
        "Co-op Bank refunds are not wired up - no confirmed reversal endpoint. " +
        "This refund must be settled manually; the refund row records what is owed.",
    });
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
   * Still NOT confirmed: how the callback authenticates itself. Parsing
   * it correctly does not make the endpoint safe to point real money at.
   */
  parseCallback(rawBody: unknown): ParsedCallback | null {
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
}

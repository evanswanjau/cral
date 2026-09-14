import { ApiError } from "@cral/types";
import type { PaymentAdapter, StkPushInput, StkPushResult } from "./types.js";

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
}

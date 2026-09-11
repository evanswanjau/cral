import { ApiError } from "@cral/types";
import type { PaymentAdapter, StkPushInput, StkPushResult } from "./types.js";

/**
 * Cooperative Bank's OpenAPI developer portal (developer.co-opbank.co.ke),
 * a WSO2 API Manager instance subscribing this app to their
 * "SafaricomSTKPush" API (context `/stkpush/safaricom/1.0.0`) — Co-op's own
 * gateway in front of Safaricom Daraja's STK push, not a raw Daraja
 * integration.
 *
 * Two things are real and safe to rely on because WSO2's OAuth2 shape is
 * documented and standard: the token endpoint and the client-credentials
 * grant. One thing is NOT confirmed: the exact STK-push resource path and
 * request field names for Co-op's proxy. Guessing those for a call that
 * moves real money is exactly what CLAUDE.md's "don't guess — read the
 * source" rule is for, so the body below is written Daraja-shaped (the
 * only reasonable default for an API literally named SafaricomSTKPush) but
 * gated behind `COOPBANK_STK_PATH_CONFIRMED=true` — set that only once
 * someone has copied the exact path + sample payload from the portal's
 * "Try Out" / API Console tab and this file has been updated to match.
 *
 * Until then this adapter throws a clear, named error rather than firing
 * an unconfirmed request at a real payment gateway.
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

/** `+254712345678` -> `254712345678` (Daraja/Co-op want no leading `+`). */
function toMsisdn(e164: string): string {
  return e164.replace(/^\+/, "");
}

/** `YYYYMMDDHHmmss` in EAT (Nairobi, UTC+3) — Daraja's timestamp format. */
function darajaTimestamp(date: Date): string {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${eat.getUTCFullYear()}${p(eat.getUTCMonth() + 1)}${p(eat.getUTCDate())}` +
    `${p(eat.getUTCHours())}${p(eat.getUTCMinutes())}${p(eat.getUTCSeconds())}`
  );
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

    const shortcode = requireEnv("COOPBANK_SHORTCODE");
    const passkey = requireEnv("COOPBANK_PASSKEY");
    const callbackUrl = requireEnv("COOPBANK_CALLBACK_URL");
    const accessToken = await getAccessToken();

    const timestamp = darajaTimestamp(new Date());
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
    const msisdn = toMsisdn(input.phone);

    // Best-guess Daraja-compatible body. CONFIRM against the portal's API
    // console before relying on this - field names, the resource path
    // below, and whether Co-op wants Password/Timestamp computed
    // client-side at all (some bank gateways compute this server-side and
    // just want BusinessShortCode + Amount + phone).
    const res = await fetch(`${apiBaseUrl()}/stkpush/safaricom/1.0.0`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(input.amountCents / 100),
        PartyA: msisdn,
        PartyB: shortcode,
        PhoneNumber: msisdn,
        CallBackURL: callbackUrl,
        AccountReference: input.accountReference,
        TransactionDesc: input.transactionDesc,
      }),
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Co-op Bank STK push failed: ${res.status} ${res.statusText} — ${text}`);
    }

    let json: {
      CheckoutRequestID?: string;
      MerchantRequestID?: string;
      ResponseDescription?: string;
      ResponseCode?: string;
    };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Co-op Bank STK response unparseable: ${text}`);
    }
    if (json.ResponseCode !== "0" || !json.CheckoutRequestID) {
      throw new Error(`Co-op Bank STK push rejected: ${json.ResponseDescription ?? text}`);
    }

    return {
      providerRequestId: json.CheckoutRequestID,
      responseDescription: json.ResponseDescription ?? "Accepted",
    };
  }
}

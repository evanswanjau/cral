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
 * Safaricom Daraja - M-Pesa direct, no bank in the middle (owner's call,
 * 2026-09-22).
 *
 * This sits alongside `CoopBankPaymentAdapter` rather than replacing it;
 * `PAYMENT_ADAPTER` picks one. Co-op's gateway stayed blocked on three
 * questions their portal doesn't answer - how the callback authenticates
 * itself, whether the STK resource shape is right
 * (`COOPBANK_STK_PATH_CONFIRMED` still gates it), and whether any
 * reversal endpoint exists at all. Daraja answers all three itself and
 * carries B2C for merchant payouts on the same credentials, so it is the
 * rail the customer-hire demo runs on.
 *
 * **Two Daraja products back this file**, both mapped to the same sandbox
 * app: "Lipa Na M-Pesa Sandbox" (STK push, below) and "M-Pesa Sandbox"
 * (B2C, for payouts and refunds - not built here, see `refund`).
 *
 * Shapes below are Daraja's documented ones:
 *
 * - **Token**: `GET /oauth/v1/generate?grant_type=client_credentials`,
 *   `Authorization: Basic base64(key:secret)` -> `{access_token,
 *   expires_in}`. `expires_in` comes back as a *string* on this API, not
 *   a number, which is why it is coerced below.
 * - **Push**: `POST /mpesa/stkpush/v1/processrequest`. `Password` is
 *   `base64(shortcode + passkey + timestamp)` and the `Timestamp` field
 *   must be the *same* timestamp that went into that hash, formatted
 *   `YYYYMMDDHHmmss`.
 * - **Ack**: `{MerchantRequestID, CheckoutRequestID, ResponseCode,
 *   ResponseDescription, CustomerMessage}`. `ResponseCode: "0"` means the
 *   prompt was accepted for delivery - it does NOT mean anyone paid.
 * - **Callback**: `{Body:{stkCallback:{MerchantRequestID,
 *   CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata?}}}`.
 *   `ResultCode` is a *number* here (0 = paid), unlike the ack's string
 *   `ResponseCode`. A failure carries no `CallbackMetadata` at all.
 *
 * **The correlator differs from Co-op's, and this matters.** Co-op echoes
 * a `MessageReference` we choose, so that adapter never depends on a
 * provider-issued id. Daraja has no such field - `AccountReference` is
 * capped at 12 characters and is not returned in the callback - so the
 * only thing tying a callback to a row is Daraja's own
 * `CheckoutRequestID` from the ack. `initiatePayment` therefore writes
 * the `payment_requests` row *before* pushing and stamps the
 * `CheckoutRequestID` on afterwards; see the note there.
 */

const DEFAULT_BASE_URL = "https://sandbox.safaricom.co.ke";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cachedToken: CachedToken | null = null;

/** Test seam - the token is a module-level cache, and a test that changes credentials needs it gone. */
export function resetDarajaTokenCache(): void {
  cachedToken = null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when PAYMENT_ADAPTER=daraja`);
  return value;
}

function baseUrl(): string {
  return process.env.DARAJA_BASE_URL ?? DEFAULT_BASE_URL;
}

/**
 * `YYYYMMDDHHmmss` in Nairobi time, which is what Daraja expects and what
 * must be hashed into `Password`.
 *
 * Note this is the one place in the API that formats a wall-clock time
 * for transmission rather than display (spec 2 keeps everything else
 * UTC). It is a provider wire-format requirement, not a product
 * decision - nothing derived from it is persisted.
 */
export function darajaTimestamp(now: Date = new Date()): string {
  const nairobi = new Date(now.getTime() + 3 * 60 * 60 * 1000); // EAT is UTC+3, no DST
  return nairobi.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

/** `+254712345678` / `0712345678` -> `254712345678`. Daraja rejects a leading `+`. */
export function toDarajaMsisdn(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return digits;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  const key = requireEnv("DARAJA_CONSUMER_KEY");
  const secret = requireEnv("DARAJA_CONSUMER_SECRET");
  const basic = Buffer.from(`${key}:${secret}`).toString("base64");

  const res = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    method: "GET",
    headers: { Authorization: `Basic ${basic}` },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Daraja token request failed: ${res.status} ${res.statusText} - ${text}`);
  }

  let json: { access_token?: string; expires_in?: string | number };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Daraja token response unparseable: ${text}`);
  }
  if (!json.access_token) {
    throw new Error(`Daraja token response missing access_token: ${text}`);
  }

  // `expires_in` is a string ("3599") on this endpoint, not a number.
  const ttlSeconds = Number(json.expires_in ?? 3600);
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (Number.isFinite(ttlSeconds) ? ttlSeconds : 3600) * 1000,
  };
  return cachedToken.accessToken;
}

export class DarajaPaymentAdapter implements PaymentAdapter {
  /** Daraja has no echo field - its `CheckoutRequestID` is the only thing the callback carries back. See the class comment. */
  readonly correlatesOn = "provider" as const;

  async initiateStkPush(input: StkPushInput): Promise<StkPushResult> {
    const shortCode = requireEnv("DARAJA_SHORTCODE");
    const passkey = requireEnv("DARAJA_PASSKEY");
    const callbackUrl = requireEnv("DARAJA_CALLBACK_URL");
    // "CustomerPayBillOnline" for a paybill (the sandbox 174379 is one),
    // "CustomerBuyGoodsOnline" for a till. A wrong value here is rejected
    // by Daraja rather than silently mischarged.
    const transactionType = process.env.DARAJA_TRANSACTION_TYPE ?? "CustomerPayBillOnline";

    const timestamp = darajaTimestamp();
    const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");
    const msisdn = toDarajaMsisdn(input.phone);
    const accessToken = await getAccessToken();

    const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: transactionType,
        // M-Pesa has no sub-shilling unit, and Daraja rejects a decimal.
        Amount: Math.round(input.amountCents / 100),
        PartyA: msisdn,
        PartyB: shortCode,
        PhoneNumber: msisdn,
        CallBackURL: callbackUrl,
        // Max 12 chars, and shown on the renter's own M-Pesa statement -
        // the booking ref is exactly the thing they would want to
        // recognise. NOT a correlator: Daraja never sends this back. See
        // the class comment.
        AccountReference: input.narration.slice(0, 12),
        TransactionDesc: input.narration.slice(0, 13),
      }),
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Daraja STK push failed: ${res.status} ${res.statusText} - ${text}`);
    }

    let json: {
      CheckoutRequestID?: string;
      MerchantRequestID?: string;
      ResponseCode?: string;
      ResponseDescription?: string;
      CustomerMessage?: string;
      errorMessage?: string;
    };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Daraja STK response unparseable: ${text}`);
    }
    if (json.ResponseCode !== "0") {
      throw new Error(
        `Daraja STK push rejected: ${json.ResponseDescription ?? json.errorMessage ?? text}`,
      );
    }
    if (!json.CheckoutRequestID) {
      // Without this there is nothing to match the callback on, so a
      // "success" here would strand a payment we could never settle.
      throw new Error(`Daraja STK response missing CheckoutRequestID: ${text}`);
    }

    return {
      providerRef: json.CheckoutRequestID,
      responseDescription: json.CustomerMessage ?? json.ResponseDescription ?? "Accepted",
    };
  }

  parseCallback(rawBody: unknown): ParsedCallback | null {
    const stk = (rawBody as { Body?: { stkCallback?: Record<string, unknown> } })?.Body?.stkCallback;
    if (!stk) return null;

    const reference = stk.CheckoutRequestID;
    if (typeof reference !== "string" || !reference) return null;

    // A number here, unlike the ack's string `ResponseCode`. Coerced
    // rather than compared against 0 directly, so a stringified result
    // code is still read correctly.
    const resultCode = Number(stk.ResultCode);
    const succeeded = resultCode === 0;
    const resultDesc = typeof stk.ResultDesc === "string" ? stk.ResultDesc : null;

    // A failure carries no CallbackMetadata at all, so both of these stay
    // null and the service records the failure on ResultDesc alone.
    const items = (stk.CallbackMetadata as { Item?: { Name?: string; Value?: unknown }[] } | undefined)
      ?.Item;
    const itemValue = (name: string): unknown =>
      Array.isArray(items) ? items.find((i) => i?.Name === name)?.Value : undefined;

    const receiptValue = itemValue("MpesaReceiptNumber");
    const amountValue = itemValue("Amount");
    const amount = Number(amountValue);

    return {
      reference,
      succeeded,
      receipt: typeof receiptValue === "string" && receiptValue ? receiptValue : null,
      failureReason: succeeded ? null : resultDesc,
      amountShillings: Number.isFinite(amount) && amount > 0 ? amount : null,
    };
  }

  /**
   * NOT IMPLEMENTED YET, and deliberately throwing rather than resolving.
   *
   * Unlike Co-op, Daraja *does* have a rail for this - B2C
   * (`/mpesa/b2c/v1/paymentrequest`, under the "M-Pesa Sandbox" product)
   * and Reversal. Neither is wired up: both need an `InitiatorName` and a
   * `SecurityCredential` (the initiator password RSA-encrypted with
   * Safaricom's published certificate) that the STK credentials do not
   * cover, plus their own result/timeout callbacks. That is the payouts
   * slice, not this one.
   *
   * It throws so the failure is loud and the refund row is left `failed`
   * for a human to settle by hand. A silent success would mark a booking
   * refunded while the renter's money sat with us.
   */
  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new ApiError({
      status: 501,
      type: "server_error",
      code: "daraja_refund_unavailable",
      message:
        "Daraja B2C is not wired up yet - it ships with the merchant-payouts slice. " +
        "This refund must be settled manually; the refund row records what is owed.",
    });
  }
}

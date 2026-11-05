import { COOP_PATHS, coopPost, coopUserId, requireCoopEnv, type CoopResponse } from "../coopbank/client.js";
import { queryTransactionStatus } from "../coopbank/transaction-status.js";
import type { DisbursementAck, DisbursementAdapter, DisbursementInput, DisbursementResult } from "./types.js";

/**
 * Co-op Connect funds transfers out of CRAL's Co-op account
 * (`COOPBANK_SOURCE_ACCOUNT`). Three APIs, one envelope, requests as in
 * Co-op's own Postman collection ("CRUZ RIDE AUTO LIMITED", received
 * 2026-11-04):
 *
 * - `pesalink` - Pesalink Send to Account 2.0.0, another bank's account
 *   (`AccountNumber` <=14 + `BankCode`).
 * - `internal` - IFT Send to Account 3.0.0, another Co-op account.
 * - `mpesa`   - B2C Send to M-Pesa 2.0.0, an M-Pesa line (`MobileNumber`).
 *
 * Each takes our `MessageReference`, `ISO2CountryCode`, a `CallBackUrl`,
 * a `Source` (our account) and one `Destinations[]` leg; Pesalink and IFT
 * also carry our `UserId`. Amounts are whole shillings, typed exactly as
 * the collection types them - M-Pesa as strings, Pesalink a number on the
 * source and a string on the leg, IFT numbers - because the collection is
 * the only evidence of what the gateway accepts. The sync answer is an
 * ack; the result arrives on the callback (the public 1.0 swagger's `103`
 * shape: same envelope with per-leg `ResponseCode` / `TransactionID`) or
 * from Transaction Status.
 *
 * Not live-tested. The collection has no responses, so results are still
 * read in the public swagger's shape.
 */

const PATHS: Record<DisbursementInput["channel"], string> = {
  pesalink: COOP_PATHS.pesalink,
  internal: COOP_PATHS.internalTransfer,
  mpesa: COOP_PATHS.sendToMpesa,
};

/** `+254712345678` -> `254712345678`. */
function toMsisdn(e164: string): string {
  return e164.replace(/^\+/, "");
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

type Leg = { ResponseCode?: unknown; ResponseDescription?: unknown; TransactionID?: unknown };

/**
 * A funds-transfer result (callback body or Transaction Status answer) as
 * a decision, or null while it doesn't settle anything.
 *
 * - Success: `MessageCode "0"` and every leg `ResponseCode "0"`.
 * - Failure: any leg (or `Source`) with a `ResponseCode` that isn't "0".
 * - Anything else - partial success, missing legs, unknown codes - null.
 */
export function readFundsTransferResult(body: Record<string, unknown>): DisbursementResult | null {
  const reference = str(body.MessageReference);
  if (!reference) return null;
  const destinations = Array.isArray(body.Destinations) ? (body.Destinations as Leg[]) : [];
  const source = (body.Source && typeof body.Source === "object" ? body.Source : {}) as Leg;

  const failed = [source, ...destinations].find((l) => {
    const rc = str(l.ResponseCode);
    return rc !== null && rc !== "0";
  });
  if (failed) {
    return {
      reference,
      succeeded: false,
      transactionId: null,
      failureReason: str(failed.ResponseDescription) ?? str(body.MessageDescription) ?? "Co-op reported the transfer failed.",
    };
  }

  if (str(body.MessageCode) !== "0" || destinations.length === 0) return null;
  if (!destinations.every((d) => str(d.ResponseCode) === "0")) return null;
  return {
    reference,
    succeeded: true,
    transactionId: str(destinations[0]!.TransactionID),
    failureReason: null,
  };
}

/** True when a body is a funds-transfer result rather than an STK result. */
export function isFundsTransferBody(body: unknown): body is Record<string, unknown> {
  return Boolean(body && typeof body === "object" && Array.isArray((body as { Destinations?: unknown }).Destinations));
}

export class CoopBankDisbursementAdapter implements DisbursementAdapter {
  readonly provider = "coopbank";

  async send(input: DisbursementInput): Promise<DisbursementAck> {
    const sourceAccount = requireCoopEnv("COOPBANK_SOURCE_ACCOUNT");
    const callbackUrl = requireCoopEnv("COOPBANK_CALLBACK_URL");
    const narration = input.narration.slice(0, 25);
    const amount = input.amountShillings;
    const { channel } = input;

    // Field order and amount types follow Co-op's collection per channel -
    // see this file's top comment.
    const leg: Record<string, unknown> = { ReferenceNumber: `${input.messageReference}_1` };
    if (channel === "mpesa") {
      leg.MobileNumber = toMsisdn(input.destination);
      leg.Amount = String(amount);
    } else {
      leg.AccountNumber = input.destination;
      if (channel === "pesalink") leg.BankCode = input.bankCode;
      leg.Amount = channel === "pesalink" ? String(amount) : amount;
      leg.TransactionCurrency = "KES";
    }
    leg.Narration = narration;

    const res: CoopResponse = await coopPost(PATHS[channel], {
      MessageReference: input.messageReference,
      ...(channel === "mpesa" ? {} : { UserId: coopUserId() }),
      ISO2CountryCode: "KE",
      CallBackUrl: callbackUrl,
      Source: {
        AccountNumber: sourceAccount,
        Amount: channel === "mpesa" ? String(amount) : amount,
        TransactionCurrency: "KES",
        Narration: narration,
      },
      Destinations: [leg],
    });

    const description = str(res.body.MessageDescription) ?? `HTTP ${res.status}`;
    // A 4xx with Co-op's envelope is a definite "no": the request was
    // malformed, unauthorised, a duplicate reference or over a limit -
    // nothing moved. 2xx is "accepted, result to follow".
    if (res.status >= 400) return { accepted: false, description, raw: res.body };
    // Some acks already carry the per-leg result; use it when they do.
    const result = readFundsTransferResult(res.body) ?? undefined;
    return { accepted: true, description, raw: res.body, ...(result ? { result } : {}) };
  }

  async queryStatus(messageReference: string): Promise<DisbursementResult | null> {
    const res = await queryTransactionStatus(messageReference);
    if (res.status !== 200) return null;
    return readFundsTransferResult({ MessageReference: messageReference, ...res.body });
  }
}

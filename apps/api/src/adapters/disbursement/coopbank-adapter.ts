import { coopPost, requireCoopEnv, type CoopResponse } from "../coopbank/client.js";
import { queryTransactionStatus } from "../coopbank/transaction-status.js";
import type { DisbursementAck, DisbursementAdapter, DisbursementInput, DisbursementResult } from "./types.js";

/**
 * Co-op Connect funds transfers out of CRAL's Co-op account
 * (`COOPBANK_SOURCE_ACCOUNT`). Three APIs, one envelope (public swagger,
 * developer.co-opbank.co.ke, read 2026-10-11):
 *
 * - `pesalink` - PesaLinkSendToAccount 1.0.0, another bank's account
 *   (`AccountNumber` <=14 + `BankCode`).
 * - `internal` - IFTAccountToAccount 2.0.0, another Co-op account.
 * - `mpesa`   - SendToM-Pesa 1.0.0, an M-Pesa line (`MobileNumber`).
 *
 * Each takes our `MessageReference`, a `CallBackUrl`, a `Source` (our
 * account) and one `Destinations[]` leg. `Amount` is an integer - whole
 * shillings. The sync answer is an ack; the result arrives on the callback
 * (the swagger's `103` shape: same envelope with per-leg `ResponseCode` /
 * `TransactionID`) or from Transaction Status.
 *
 * Not live-tested: the sandbox gateway 302s every API call as of
 * 2026-10-12. Shapes are the swagger's.
 */

const PATHS: Record<DisbursementInput["channel"], string> = {
  pesalink: "/FundsTransfer/External/A2A/PesaLink/1.0.0",
  internal: "/FundsTransfer/Internal/A2A/2.0.0",
  mpesa: "/FundsTransfer/External/A2M/Mpesa/1.0.0",
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

    const leg: Record<string, unknown> = {
      ReferenceNumber: `${input.messageReference}_1`,
      Amount: input.amountShillings,
      TransactionCurrency: "KES",
      Narration: narration,
    };
    if (input.channel === "mpesa") {
      leg.MobileNumber = toMsisdn(input.destination);
    } else {
      leg.AccountNumber = input.destination;
      if (input.channel === "pesalink") leg.BankCode = input.bankCode;
    }

    const res: CoopResponse = await coopPost(PATHS[input.channel], {
      MessageReference: input.messageReference,
      CallBackUrl: callbackUrl,
      Source: {
        AccountNumber: sourceAccount,
        Amount: input.amountShillings,
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

import type { ParsedCallback } from "../payment/types.js";
import { coopPost, type CoopResponse } from "./client.js";

/**
 * Co-op's Transaction Status Enquiry 2.0.0 (`POST /Enquiry/TransactionStatus/2.0.0`,
 * body `{ MessageReference }`) - what happened to a request we sent
 * earlier, asked by the same `MessageReference`.
 *
 * Documented answers (public swagger):
 * - `200` `MessageCode "0"` "FULL SUCCESS", with `Source` and
 *   `Destinations[]` legs, each carrying `ResponseCode`/`TransactionID`.
 * - `207` `MessageCode "1"` "PARTIAL SUCCESS" - some legs failed.
 * - `404` - no request with that reference.
 * - `400`/`401` - our request or token was wrong.
 *
 * The response is shaped for funds transfers. What it returns for an STK
 * reference is not documented, so the readers below decide only on
 * answers that are unambiguous and treat everything else as "not known
 * yet". Guessing "failed" would leave a renter who paid looking unpaid;
 * guessing "success" would mark a booking paid for money nobody sent.
 */
export async function queryTransactionStatus(messageReference: string): Promise<CoopResponse> {
  return coopPost("/Enquiry/TransactionStatus/2.0.0", { MessageReference: messageReference });
}

type Leg = { ResponseCode?: unknown; ResponseDescription?: unknown; TransactionID?: unknown; Amount?: unknown };

function legs(body: Record<string, unknown>): Leg[] {
  return Array.isArray(body.Destinations) ? (body.Destinations as Leg[]) : [];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * Reads a Transaction Status answer for an STK push as the settle rules'
 * `ParsedCallback`, or null when it doesn't settle anything yet.
 *
 * - Success: HTTP 200, `MessageCode "0"` and an M-Pesa receipt somewhere
 *   (a destination leg's `TransactionID`, or a top-level one, which the
 *   STK callback itself uses). No receipt, no success.
 * - Failure: HTTP 200 and a leg whose `ResponseCode` is present and not
 *   `"0"` - Co-op saying in so many words that it didn't go through.
 * - Everything else (404, 207, unknown codes, missing fields): null.
 *
 * `amountShillings` comes from the leg or `Source.Amount` when present, so
 * `applySettlement`'s amount check still applies.
 */
export function interpretStkStatus(reference: string, res: CoopResponse): ParsedCallback | null {
  if (res.status !== 200) return null;
  const body = res.body;
  const code = str(body.MessageCode);
  const description = str(body.MessageDescription);
  const destinations = legs(body);
  const source = (body.Source && typeof body.Source === "object" ? body.Source : {}) as Leg;

  const failedLeg = [source, ...destinations].find((l) => {
    const rc = str(l.ResponseCode);
    return rc !== null && rc !== "0";
  });
  if (failedLeg) {
    return {
      reference,
      succeeded: false,
      receipt: null,
      failureReason: str(failedLeg.ResponseDescription) ?? description ?? "Co-op reported the transaction failed.",
      amountShillings: null,
    };
  }

  if (code !== "0") return null;
  const receipt = destinations.map((d) => str(d.TransactionID)).find(Boolean) ?? str(body.TransactionID);
  if (!receipt) return null;

  const amountRaw = destinations[0]?.Amount ?? source.Amount ?? body.TransactionAmount;
  const amount = Number(amountRaw);
  return {
    reference,
    succeeded: true,
    receipt,
    failureReason: null,
    amountShillings: Number.isFinite(amount) && amount > 0 ? amount : null,
  };
}

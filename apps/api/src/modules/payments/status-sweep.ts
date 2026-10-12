import { db } from "../../db/client.js";
import { coopBankConfigured } from "../../adapters/coopbank/client.js";
import { interpretStkStatus, queryTransactionStatus } from "../../adapters/coopbank/transaction-status.js";
import type { CoopResponse } from "../../adapters/coopbank/client.js";
import { applySettlement, type PaymentRequestRow } from "./service.js";

/**
 * Settles Co-op STK requests whose callback never arrived, by asking
 * Co-op's Transaction Status API.
 *
 * A renter can approve the prompt and be charged while the callback is
 * lost (our API restarting, a network blip, Co-op's own retries giving
 * up). Without this the money is taken and the booking reads unpaid for
 * ever - `expires_at` only stops a *new* prompt being blocked, it doesn't
 * find out what happened to the old one.
 *
 * Every decision goes through `applySettlement`, the one copy of the
 * settle rules, so the amount check and the idempotency apply exactly as
 * they do for a real callback. A lookup that throws or comes back
 * ambiguous leaves the row alone for the next sweep.
 */

/** Give the real callback a head start before asking. */
export const STATUS_QUERY_AFTER_MS = 2 * 60 * 1000;
/** Stop asking after a day - Co-op's own records are the place to chase anything older. */
export const STATUS_QUERY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Per sweep, so a backlog can't turn one run into hundreds of calls. */
const BATCH = 50;

export interface StatusSweepResult {
  checked: number;
  settled: number;
  /** Lookups that threw - the gateway didn't answer usefully. */
  errors: number;
}

export async function reconcilePendingCoopPayments(
  now: Date = new Date(),
  query: (messageReference: string) => Promise<CoopResponse> = queryTransactionStatus,
): Promise<StatusSweepResult> {
  const result: StatusSweepResult = { checked: 0, settled: 0, errors: 0 };
  if (!coopBankConfigured()) return result;

  const rows = await db<PaymentRequestRow>("payment_requests")
    .where({ provider: "coopbank", status: "pending" })
    .whereNotNull("provider_request_id")
    .where("created_at", "<=", new Date(now.getTime() - STATUS_QUERY_AFTER_MS))
    .where("created_at", ">", new Date(now.getTime() - STATUS_QUERY_WINDOW_MS))
    .orderBy("created_at", "asc")
    .limit(BATCH);

  for (const row of rows) {
    const reference = row.provider_request_id!;
    result.checked += 1;
    let res: CoopResponse;
    try {
      res = await query(reference);
    } catch (err) {
      result.errors += 1;
      console.warn(`[payments] status query failed for ${reference}: ${(err as Error).message}`);
      continue;
    }
    const parsed = interpretStkStatus(reference, res);
    if (!parsed) continue;
    await applySettlement(parsed, res.body, { ip: null, requestId: null }, "status-query");
    result.settled += 1;
  }
  return result;
}

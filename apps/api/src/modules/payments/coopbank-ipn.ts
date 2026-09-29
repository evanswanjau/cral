import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import type { RequestContext } from "./service.js";

/**
 * Co-op Bank's account-event notification ("B2B IPN", their Core Banking
 * Event Notification Specification v1.1). The bank POSTs one JSON object
 * per debit or credit on CRAL's account as it posts:
 *
 *   { AcctNo, Amount, BookedBalance, ClearedBalance, Currency,
 *     CustMemoLine1..3, EventType: "DEBIT"|"CREDIT", ExchangeRate,
 *     Narration, PaymentRef, PostingDate, ValueDate, TransactionDate,
 *     TransactionId }
 *
 * every value a string, amounts as decimals ("22459.0"), dates as
 * "2023-11-06+03:00". Anything but a 2xx is redelivered, so the same
 * `TransactionId` can arrive more than once - it's stored once and every
 * repeat is acknowledged.
 *
 * This only records. Nothing matches an event to a booking yet: the spec
 * doesn't say which field would carry a renter's account reference, and
 * guessing would settle the wrong booking.
 */

export type IpnResult =
  | { ok: true; duplicate: boolean; id: string | null }
  | { ok: false; message: string };

/**
 * A decimal string to integer cents without going through a float.
 * Returns null for anything that isn't a plain non-negative decimal -
 * including the bank's own masked sample balances ("xx.9").
 */
export function decimalToCents(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string") return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return null;
  const [, sign, whole, frac = ""] = match;
  // "22459.500" is fine; "22459.505" is a sub-cent amount we can't hold.
  if (frac.length > 2 && !/^0+$/.test(frac.slice(2))) return null;
  const cents = Number(whole) * 100 + Number(frac.slice(0, 2).padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return sign === "-" ? -cents : cents;
}

/** "2023-11-06+03:00" -> "2023-11-06". The calendar date as the bank gave it. */
function bankDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1]! : null;
}

/** Empty strings are how the bank says "absent". */
function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

export async function recordCoopBankIpn(body: unknown, ctx: RequestContext): Promise<IpnResult> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Expected a JSON object." };
  }
  const b = body as Record<string, unknown>;

  const transactionId = text(b.TransactionId);
  const accountNo = text(b.AcctNo);
  const eventType = text(b.EventType)?.toLowerCase();
  const amount = decimalToCents(b.Amount);
  const currency = text(b.Currency)?.toUpperCase();

  if (!transactionId || transactionId.length > 64) return { ok: false, message: "Invalid TransactionId." };
  if (!accountNo || accountNo.length > 34) return { ok: false, message: "Invalid AcctNo." };
  if (eventType !== "credit" && eventType !== "debit") return { ok: false, message: "Invalid EventType." };
  if (amount === null || amount < 0) return { ok: false, message: "Invalid Amount." };
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return { ok: false, message: "Invalid Currency." };

  const paymentRef = text(b.PaymentRef);

  return db.transaction(async (trx) => {
    const id = generateId("bankAccountEvent");
    const inserted = await trx("bank_account_events")
      .insert({
        id,
        provider: "coopbank",
        transaction_id: transactionId,
        account_no: accountNo,
        event_type: eventType,
        amount_amount: amount,
        amount_currency: currency,
        booked_balance_amount: decimalToCents(b.BookedBalance),
        cleared_balance_amount: decimalToCents(b.ClearedBalance),
        payment_ref: paymentRef && paymentRef.length <= 64 ? paymentRef : null,
        narration: text(b.Narration),
        cust_memo_line1: text(b.CustMemoLine1),
        cust_memo_line2: text(b.CustMemoLine2),
        cust_memo_line3: text(b.CustMemoLine3),
        exchange_rate: text(b.ExchangeRate)?.slice(0, 32) ?? null,
        transaction_date: bankDate(b.TransactionDate),
        posting_date: bankDate(b.PostingDate),
        value_date: bankDate(b.ValueDate),
        payload: JSON.stringify(body),
      })
      .onConflict(["provider", "transaction_id"])
      .ignore()
      .returning("id");

    if (inserted.length === 0) return { ok: true, duplicate: true, id: null };

    await writeAuditEntry(trx, {
      actorType: "system",
      actorId: "coopbank-ipn",
      action: "bank_event.received",
      entityType: "bank_account_event",
      entityId: id,
      after: {
        transaction_id: transactionId,
        event_type: eventType,
        amount: { amount, currency },
        payment_ref: paymentRef,
      },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    return { ok: true, duplicate: false, id };
  });
}

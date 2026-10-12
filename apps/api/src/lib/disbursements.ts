import type { Knex } from "knex";
import { ulid } from "ulid";
import { ApiError } from "@cral/types";
import { db } from "../db/client.js";
import { generateId } from "./ids.js";
import { writeAuditEntry } from "./audit.js";
import { notify } from "./notifications.js";
import { normalizePhone } from "./identifier.js";
import { COOP_BANK_NAME, pesalinkBankCode } from "./bank-codes.js";
import { createDisbursementAdapter } from "../adapters/disbursement/index.js";
import type {
  DisbursementAdapter,
  DisbursementChannel,
  DisbursementResult,
} from "../adapters/disbursement/index.js";
import { enqueueNotificationDelivery } from "../jobs/notification-delivery.js";
import type { PayoutRunRow } from "../modules/payouts/db-types.js";

/**
 * Money going out - merchant payouts and renter refunds - through one set
 * of rules, the same way `modules/payments/service.ts#applySettlement` is
 * the one set of rules for money coming in.
 *
 * Shape, borrowed from `notify()` / `recordRefund`:
 * 1. `create*Disbursement(trx, ...)` writes the attempt row inside the
 *    caller's transaction, BEFORE anything is sent.
 * 2. `sendDisbursement(id)` runs after that commits. It never throws - a
 *    provider error must not roll back the decision that caused it.
 * 3. `settleDisbursement(result)` applies the final answer, from the ack,
 *    the callback or a Transaction Status lookup - whichever lands first;
 *    the rest are no-ops.
 */

export const disbursementAdapter: DisbursementAdapter = createDisbursementAdapter();

export interface DisbursementRow {
  id: string;
  kind: "payout" | "refund";
  payout_run_id: string | null;
  refund_id: string | null;
  channel: DisbursementChannel;
  destination: string;
  bank_name: string | null;
  bank_code: string | null;
  account_name: string | null;
  amount_amount: number;
  amount_currency: string;
  sent_shillings: number;
  message_reference: string;
  status: "pending" | "processing" | "success" | "failed";
  provider: string;
  provider_transaction_id: string | null;
  failure_reason: string | null;
  sent_at: Date | null;
  settled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface Actor {
  actorId: string | null;
  actorType: "user" | "admin" | "system";
  requestId?: string | null;
  ip?: string | null;
}

/**
 * Co-op takes whole shillings. Cents below a shilling stay unsent and are
 * visible on the row as `amount - sent_shillings * 100` - never rounded up
 * (that would send money nobody owes) and never silently lost.
 */
export function wholeShillings(cents: number): number {
  return Math.floor(cents / 100);
}

/** Which Co-op API carries a payment to this destination. */
function routeFor(
  method: string,
  detail: string,
  bankName: string | null,
): { channel: DisbursementChannel; destination: string; bankCode: string | null } {
  if (method === "mpesa") {
    const phone = normalizePhone(detail);
    if (!phone) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "payout_phone_invalid",
        message: `The payout line ${detail} isn't a Kenyan mobile number.`,
      });
    }
    return { channel: "mpesa", destination: phone, bankCode: null };
  }
  if (!bankName) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "bank_details_missing",
      message: "This merchant has no bank on file.",
    });
  }
  if (bankName.trim() === COOP_BANK_NAME) {
    return { channel: "internal", destination: detail, bankCode: null };
  }
  const bankCode = pesalinkBankCode(bankName);
  if (!bankCode) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "bank_code_unknown",
      message: `No Pesalink bank code is on file for "${bankName}".`,
    });
  }
  return { channel: "pesalink", destination: detail, bankCode };
}

/**
 * Starts paying a payout run: writes the attempt and moves the run to
 * `processing`, in the caller's transaction. Only a `scheduled` run, or a
 * `failed` one being retried, can be paid. The partial unique index on
 * `disbursements.payout_run_id` is what stops two attempts going out at
 * once; the status check gives the clean error.
 */
export async function createPayoutDisbursement(trx: Knex.Transaction, runId: string, actor: Actor): Promise<string> {
  const run = (await trx<PayoutRunRow>("payout_runs").where({ id: runId }).forUpdate().first()) as
    | PayoutRunRow
    | undefined;
  if (!run) {
    throw new ApiError({ status: 404, type: "not_found", code: "payout_run_not_found", message: "No such payout run." });
  }
  if (run.status !== "scheduled" && run.status !== "failed") {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "payout_run_not_payable",
      message: `This run is ${run.status} - only a scheduled or failed run can be paid.`,
    });
  }

  const merchant = (await trx("merchants").where({ id: run.merchant_id }).first("bank_name")) as
    | { bank_name: string | null }
    | undefined;
  const bankName = run.destination_method === "bank" ? (merchant?.bank_name ?? null) : null;
  const route = routeFor(run.destination_method, run.destination_detail, bankName);
  const sent = wholeShillings(run.net_amount);
  if (sent <= 0) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "payout_amount_zero",
      message: "There is nothing to send on this run.",
    });
  }

  const id = generateId("disbursement");
  await trx("disbursements").insert({
    id,
    kind: "payout",
    payout_run_id: run.id,
    channel: route.channel,
    destination: route.destination,
    bank_name: bankName,
    bank_code: route.bankCode,
    account_name: run.destination_account_name,
    amount_amount: run.net_amount,
    amount_currency: run.net_currency,
    sent_shillings: sent,
    message_reference: ulid(),
    status: "pending",
    provider: disbursementAdapter.provider,
  });
  await trx<PayoutRunRow>("payout_runs").where({ id: run.id }).update({ status: "processing", updated_at: new Date() });

  await writeAuditEntry(trx, {
    actorId: actor.actorId,
    actorType: actor.actorType,
    action: "payout_run.pay",
    entityType: "payout_run",
    entityId: run.id,
    before: { status: run.status },
    after: { status: "processing", disbursement_id: id, channel: route.channel, sent_shillings: sent },
    requestId: actor.requestId ?? null,
    ip: actor.ip ?? null,
  });
  return id;
}

/** A refund goes back by Send to M-Pesa to the line the payment came from. */
export async function createRefundDisbursement(trx: Knex.Transaction, refundId: string): Promise<string> {
  const refund = (await trx("refunds").where({ id: refundId }).forUpdate().first()) as
    | { id: string; phone: string; amount_amount: number; amount_currency: string; booking_id: string }
    | undefined;
  if (!refund) throw new Error(`refund ${refundId} not found`);
  const phone = normalizePhone(refund.phone);
  if (!phone) throw new Error(`refund ${refundId} has no usable phone (${refund.phone})`);

  const id = generateId("disbursement");
  await trx("disbursements").insert({
    id,
    kind: "refund",
    refund_id: refund.id,
    channel: "mpesa",
    destination: phone,
    amount_amount: refund.amount_amount,
    amount_currency: refund.amount_currency,
    sent_shillings: wholeShillings(refund.amount_amount),
    message_reference: ulid(),
    status: "pending",
    provider: disbursementAdapter.provider,
  });
  return id;
}

/**
 * Sends a written attempt. Never throws.
 *
 * - No usable answer (network, gateway redirect): left `pending` with
 *   `sent_at` set, for the status sweep. The money may have moved, so it
 *   must not be called failed and retried.
 * - Refused outright: settled `failed` - nothing moved.
 * - Accepted: `processing`, unless the ack already carries the result.
 *
 * The console adapter is refused in production: a console "payout" would
 * mark a merchant paid with nothing sent.
 */
export async function sendDisbursement(id: string, narration: string): Promise<void> {
  const row = (await db<DisbursementRow>("disbursements").where({ id }).first()) as DisbursementRow | undefined;
  if (!row || row.status !== "pending" || row.sent_at) return;

  if (process.env.NODE_ENV === "production" && disbursementAdapter.provider === "console") {
    await settleDisbursement(
      {
        reference: row.message_reference,
        succeeded: false,
        transactionId: null,
        failureReason: "No payout rail is configured (DISBURSEMENT_ADAPTER=console). Nothing was sent.",
      },
      null,
      "ack",
    );
    return;
  }

  await db("disbursements").where({ id }).update({ sent_at: new Date(), updated_at: new Date() });
  try {
    const ack = await disbursementAdapter.send({
      messageReference: row.message_reference,
      channel: row.channel,
      destination: row.destination,
      bankCode: row.bank_code,
      amountShillings: row.sent_shillings,
      narration,
    });
    await db("disbursements")
      .where({ id, status: "pending" })
      .update({
        status: ack.accepted ? "processing" : "pending",
        raw_ack: JSON.stringify(ack.raw ?? null),
        updated_at: new Date(),
      });
    if (!ack.accepted) {
      await settleDisbursement(
        { reference: row.message_reference, succeeded: false, transactionId: null, failureReason: ack.description },
        ack.raw,
        "ack",
      );
    } else if (ack.result) {
      await settleDisbursement(ack.result, ack.raw, "ack");
    }
  } catch (err) {
    console.warn(`[disbursement] ${id} sent with no usable answer: ${(err as Error).message}`);
    await db("disbursements")
      .where({ id })
      .update({ raw_ack: JSON.stringify({ error: (err as Error).message }), updated_at: new Date() });
  }
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function destinationLabel(row: DisbursementRow): string {
  if (row.channel === "mpesa") return `M-Pesa ${row.destination}`;
  return `${row.bank_name ?? "bank"} account ending ${row.destination.slice(-4)}`;
}

/**
 * Applies a final result. Idempotent: only a `pending`/`processing`
 * attempt is changed, so the ack, the callback and the status sweep can
 * all report the same outcome without doing anything twice. Returns
 * whether this call made the change.
 */
export async function settleDisbursement(
  result: DisbursementResult,
  raw: unknown,
  via: "ack" | "callback" | "status-query",
): Promise<boolean> {
  const notifications: { merchantId: string; ids: string[] } = { merchantId: "", ids: [] };

  const changed = await db.transaction(async (trx) => {
    const row = (await trx<DisbursementRow>("disbursements")
      .where({ message_reference: result.reference })
      .forUpdate()
      .first()) as DisbursementRow | undefined;
    if (!row || (row.status !== "pending" && row.status !== "processing")) return false;

    const now = new Date();
    const status = result.succeeded ? "success" : "failed";
    await trx("disbursements")
      .where({ id: row.id })
      .update({
        status,
        provider_transaction_id: result.transactionId,
        failure_reason: result.succeeded ? null : result.failureReason,
        raw_result: JSON.stringify(raw ?? null),
        settled_at: now,
        updated_at: now,
      });

    if (row.kind === "payout" && row.payout_run_id) {
      const run = (await trx<PayoutRunRow>("payout_runs").where({ id: row.payout_run_id }).first()) as PayoutRunRow;
      await trx<PayoutRunRow>("payout_runs")
        .where({ id: run.id })
        .update(
          result.succeeded
            ? { status: "paid", paid_at: now, provider_code: result.transactionId, updated_at: now }
            : { status: "failed", updated_at: now },
        );
      if (result.succeeded) {
        const notificationId = await notify(trx, {
          merchantId: run.merchant_id,
          category: "payout",
          title: `${run.ref} · payout sent · KES ${money(row.sent_shillings * 100)}`,
          body:
            `Sent to ${destinationLabel(row)}.` +
            (result.transactionId ? ` Reference ${result.transactionId}.` : ""),
          ref: run.ref,
          subjectType: "payout_run",
          subjectId: run.id,
          occurredAt: now,
        });
        notifications.merchantId = run.merchant_id;
        notifications.ids.push(notificationId);
      }
    }

    if (row.kind === "refund" && row.refund_id) {
      await trx("refunds")
        .where({ id: row.refund_id })
        .update({
          status,
          provider_ref: result.transactionId,
          failure_reason: result.succeeded ? null : result.failureReason,
          updated_at: now,
        });
    }

    await writeAuditEntry(trx, {
      actorId: `${row.provider}-${via}`,
      actorType: "system",
      action: result.succeeded ? "disbursement.succeeded" : "disbursement.failed",
      entityType: row.kind === "payout" ? "payout_run" : "refund",
      entityId: (row.payout_run_id ?? row.refund_id)!,
      after: {
        disbursement_id: row.id,
        transaction_id: result.transactionId,
        failure_reason: result.succeeded ? null : result.failureReason,
      },
    });
    return true;
  });

  // After commit - a failed SMS/email must not undo the payout record.
  if (notifications.ids.length) {
    await enqueueNotificationDelivery(notifications.merchantId, notifications.ids);
  }
  return changed;
}

/** Give the callback a head start; stop asking after a week. */
const QUERY_AFTER_MS = 2 * 60 * 1000;
const QUERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Asks the provider about attempts that were sent but haven't settled -
 * the callback was lost, or the send itself got no usable answer. Run by
 * the same 5-minute job as the STK status sweep.
 */
export async function reconcileDisbursements(
  now: Date = new Date(),
  adapter: DisbursementAdapter = disbursementAdapter,
): Promise<{ checked: number; settled: number; errors: number }> {
  const result = { checked: 0, settled: 0, errors: 0 };
  if (adapter.provider === "console") return result;

  const rows = (await db<DisbursementRow>("disbursements")
    .whereIn("status", ["pending", "processing"])
    .where({ provider: adapter.provider })
    .whereNotNull("sent_at")
    .where("sent_at", "<=", new Date(now.getTime() - QUERY_AFTER_MS))
    .where("sent_at", ">", new Date(now.getTime() - QUERY_WINDOW_MS))
    .orderBy("sent_at", "asc")
    .limit(50)) as DisbursementRow[];

  for (const row of rows) {
    result.checked += 1;
    try {
      const answer = await adapter.queryStatus(row.message_reference);
      if (answer && (await settleDisbursement(answer, answer, "status-query"))) result.settled += 1;
    } catch (err) {
      result.errors += 1;
      console.warn(`[disbursement] status query failed for ${row.id}: ${(err as Error).message}`);
    }
  }
  return result;
}

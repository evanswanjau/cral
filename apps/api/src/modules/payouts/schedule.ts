import type { Knex } from "knex";
import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { merchantDisplayName } from "../../lib/merchant-display.js";
import { enqueueNotificationDelivery } from "../../jobs/notification-delivery.js";
import type { MerchantRow } from "../merchant/db-types.js";
import { cutPayoutRun, holdLapsed, nairobiDay, payableBookings } from "./service.js";
import type { PayoutRunRow } from "./db-types.js";

/**
 * When payout runs are cut, and where each one goes.
 *
 * Owner's call (2026-10-11): runs are cut on a schedule, and Finance
 * approves each in Ops before money moves (`modules/admin-payouts`). This
 * file only cuts; nothing here sends money.
 *
 * Rhythm, from the merchant's own payout settings (Settings -> Payouts):
 * - M-Pesa, `weekly`  - every Monday (Nairobi).
 * - M-Pesa, `monthly` - the 1st.
 * - Bank              - always the 1st (the service coerces bank to monthly).
 */

export interface PayoutDestination {
  method: "mpesa" | "bank";
  detail: string;
  accountName: string;
}

/** True when a merchant's run is due on `day` (Nairobi "YYYY-MM-DD"). */
export function payoutDueOn(day: string, method: string, schedule: string): boolean {
  const date = new Date(`${day}T00:00:00.000Z`);
  const isFirst = date.getUTCDate() === 1;
  if (method === "bank" || schedule === "monthly") return isFirst;
  return date.getUTCDay() === 1; // Monday
}

/**
 * Where a merchant is paid, read live at cut time and then frozen on the
 * run (`destination_*`), so later edits can't redirect a run already cut.
 * M-Pesa always goes to `users.phone` (the verified payout line); bank to
 * the account on the merchant row.
 */
export async function merchantPayoutDestination(
  trx: Knex.Transaction | Knex,
  merchant: MerchantRow,
): Promise<PayoutDestination> {
  if (merchant.payout_method === "bank") {
    if (!merchant.bank_account_number || !merchant.bank_name) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "bank_details_missing",
        message: "This merchant is paid by bank but has no complete bank details on file.",
      });
    }
    return {
      method: "bank",
      detail: merchant.bank_account_number,
      accountName: merchant.bank_account_name ?? merchantDisplayName(merchant),
    };
  }
  const user = (await trx("users").where({ id: merchant.user_id }).first("phone", "phone_verified")) as
    | { phone: string | null; phone_verified: boolean }
    | undefined;
  if (!user?.phone || !user.phone_verified) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "payout_phone_unverified",
      message: "This merchant has no verified M-Pesa line to pay to.",
    });
  }
  return {
    method: "mpesa",
    detail: user.phone,
    accountName: merchant.payout_mpesa_name ?? merchantDisplayName(merchant),
  };
}

/**
 * Cuts one run for a merchant now, dated `day`, and enqueues the
 * "payout scheduled" message after commit. Null when nothing is payable.
 * Shared by the daily job and Finance's "cut now" in Ops.
 */
export async function cutRunForMerchant(merchantId: string, day: string): Promise<PayoutRunRow | null> {
  const run = await db.transaction(async (trx) => {
    const merchant = (await trx<MerchantRow>("merchants").where({ id: merchantId }).forUpdate().first()) as
      | MerchantRow
      | undefined;
    if (!merchant) {
      throw new ApiError({ status: 404, type: "not_found", code: "merchant_not_found", message: "No such merchant." });
    }
    // Nothing owed is the more useful answer than a destination problem.
    if ((await payableBookings(trx, merchantId)).length === 0) return null;
    const destination = await merchantPayoutDestination(trx, merchant);
    return cutPayoutRun(trx, merchantId, destination, { runDate: day });
  });
  if (run) {
    const ids = (await db("notifications").where({ subject_type: "payout_run", subject_id: run.id }).pluck("id")) as string[];
    await enqueueNotificationDelivery(run.merchant_id, ids);
  }
  return run;
}

export interface CutSweepResult {
  day: string;
  cut: number;
  /** Merchants due today who couldn't be cut, and why - for the logs. */
  skipped: Array<{ merchantId: string; reason: string }>;
}

/**
 * The daily sweep: every approved, active merchant with payable bookings
 * whose run is due today gets one run. Each merchant is its own
 * transaction, so one with broken payout details doesn't stop the rest.
 */
export async function cutDuePayoutRuns(
  now: Date = new Date(),
  /** Test seam: restrict to these merchants (the suite shares one database). */
  onlyMerchantIds?: string[],
): Promise<CutSweepResult> {
  const day = nairobiDay(now);
  const result: CutSweepResult = { day, cut: 0, skipped: [] };

  const candidates = (await db("merchants as m")
    .join("users as u", "u.id", "m.user_id")
    .whereNotNull("m.approved_at")
    .where("u.status", "active")
    .modify((q) => {
      if (onlyMerchantIds) q.whereIn("m.id", onlyMerchantIds);
    })
    .whereExists(function payable() {
      this.select(db.raw("1"))
        .from("bookings as b")
        .leftJoin("payout_run_lines as l", "l.booking_id", "b.id")
        .whereRaw("b.merchant_id = m.id")
        .where("b.status", "completed")
        .modify((q) => holdLapsed(q, "b"))
        .whereNull("l.id");
    })
    .select("m.id", "m.payout_method", "m.payout_schedule")) as Array<{
    id: string;
    payout_method: string;
    payout_schedule: string;
  }>;

  for (const m of candidates) {
    if (!payoutDueOn(day, m.payout_method, m.payout_schedule)) continue;
    try {
      if (await cutRunForMerchant(m.id, day)) result.cut += 1;
    } catch (err) {
      const reason = err instanceof ApiError ? err.code : (err as Error).message;
      result.skipped.push({ merchantId: m.id, reason });
      console.warn(`[payouts] could not cut a run for ${m.id}: ${reason}`);
    }
  }
  return result;
}

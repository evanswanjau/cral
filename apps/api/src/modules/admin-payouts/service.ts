import { ApiError, kes, type Money, type PaginatedResult } from "@cral/types";
import { db } from "../../db/client.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { merchantDisplayName } from "../../lib/merchant-display.js";
import {
  createPayoutDisbursement,
  disbursementAdapter,
  sendDisbursement,
  wholeShillings,
  type DisbursementRow,
} from "../../lib/disbursements.js";
import type { MerchantRow } from "../merchant/db-types.js";
import type { PayoutRunLineRow, PayoutRunRow, PayoutRunStatus } from "../payouts/db-types.js";
import { nairobiDay } from "../payouts/service.js";
import { cutRunForMerchant } from "../payouts/schedule.js";
import type { CutRunInput, RunListQuery } from "./schemas.js";

/**
 * Ops Finance: payout runs waiting for approval, and the Pay button.
 *
 * Owner's call (2026-10-11): a scheduled job cuts runs; an `admin_finance`
 * user reviews each and presses Pay. Paying hands the run to
 * `lib/disbursements.ts`, the one set of rules for money going out - this
 * module never moves money itself and never decides what a run contains
 * (that is `cutPayoutRun`).
 */

export interface AdminContextInput {
  adminId: string;
  adminName: string;
  ip: string | null;
  requestId: string | null;
}

export interface AttemptView {
  id: string;
  status: DisbursementRow["status"];
  channel: DisbursementRow["channel"];
  destination: string;
  bank_name: string | null;
  bank_code: string | null;
  sent: Money;
  provider_transaction_id: string | null;
  failure_reason: string | null;
  created_at: string;
  sent_at: string | null;
  settled_at: string | null;
}

export interface RunListItem {
  id: string;
  ref: string;
  status: PayoutRunStatus;
  run_date: string;
  merchant: { id: string; name: string };
  net: Money;
  /** What Pay would actually send: Co-op takes whole shillings. */
  sendable: Money;
  destination: { method: string; detail: string; account_name: string };
  hires: number;
  provider_code: string | null;
  paid_at: string | null;
  created_at: string;
  last_attempt: AttemptView | null;
}

export interface RunDetail extends RunListItem {
  lines: Array<{
    id: string;
    booking_id: string | null;
    booking_ref: string;
    hirer_name: string;
    vehicle_registration: string;
    pickup_at: string;
    dropoff_at: string;
    gross: Money;
    commission: Money;
    net: Money;
  }>;
  attempts: AttemptView[];
  /** False when Pay would be refused: wrong status, or no real rail in production. */
  can_pay: boolean;
}

function attemptView(d: DisbursementRow): AttemptView {
  return {
    id: d.id,
    status: d.status,
    channel: d.channel,
    destination: d.destination,
    bank_name: d.bank_name,
    bank_code: d.bank_code,
    sent: kes(d.sent_shillings * 100),
    provider_transaction_id: d.provider_transaction_id,
    failure_reason: d.failure_reason,
    created_at: d.created_at.toISOString(),
    sent_at: d.sent_at ? d.sent_at.toISOString() : null,
    settled_at: d.settled_at ? d.settled_at.toISOString() : null,
  };
}

/** True when Pay would actually move money here. */
function railReady(): boolean {
  return !(process.env.NODE_ENV === "production" && disbursementAdapter.provider === "console");
}

async function decorate(runs: PayoutRunRow[]): Promise<RunListItem[]> {
  if (runs.length === 0) return [];
  const runIds = runs.map((r) => r.id);
  const merchantIds = [...new Set(runs.map((r) => r.merchant_id))];

  const [merchants, counts, attempts] = await Promise.all([
    db<MerchantRow>("merchants").whereIn("id", merchantIds).select("*"),
    db("payout_run_lines")
      .whereIn("payout_run_id", runIds)
      .groupBy("payout_run_id")
      .select("payout_run_id")
      .count<{ payout_run_id: string; count: string }[]>("id as count"),
    db<DisbursementRow>("disbursements").whereIn("payout_run_id", runIds).orderBy("created_at", "desc").select("*"),
  ]);
  const nameOf = new Map(merchants.map((m) => [m.id, merchantDisplayName(m as MerchantRow)]));
  const hiresOf = new Map(counts.map((c) => [c.payout_run_id, Number(c.count)]));
  const lastAttempt = new Map<string, DisbursementRow>();
  for (const a of attempts as DisbursementRow[]) {
    if (a.payout_run_id && !lastAttempt.has(a.payout_run_id)) lastAttempt.set(a.payout_run_id, a);
  }

  return runs.map((r) => {
    const last = lastAttempt.get(r.id);
    return {
      id: r.id,
      ref: r.ref,
      status: r.status,
      run_date: r.run_date,
      merchant: { id: r.merchant_id, name: nameOf.get(r.merchant_id) ?? "(unknown merchant)" },
      net: kes(r.net_amount),
      sendable: kes(wholeShillings(r.net_amount) * 100),
      destination: { method: r.destination_method, detail: r.destination_detail, account_name: r.destination_account_name },
      hires: hiresOf.get(r.id) ?? 0,
      provider_code: r.provider_code,
      paid_at: r.paid_at ? r.paid_at.toISOString() : null,
      created_at: r.created_at.toISOString(),
      last_attempt: last ? attemptView(last) : null,
    };
  });
}

export async function listRuns(
  query: RunListQuery,
): Promise<PaginatedResult<RunListItem> & { counts: Record<PayoutRunStatus, number> }> {
  let q = db<PayoutRunRow>("payout_runs");
  if (query.status === "open") q = q.whereIn("status", ["scheduled", "failed"]);
  else if (query.status !== "all") q = q.where({ status: query.status });

  // Work queues read oldest first; history reads newest first.
  const oldestFirst = query.status === "open" || query.status === "scheduled" || query.status === "failed" || query.status === "processing";
  q = applyCursor(q, {
    sortColumn: "created_at",
    direction: oldestFirst ? "asc" : "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const rows = (await q.select("*")) as PayoutRunRow[];
  const page = toPaginatedResult(rows, query.limit, "created_at");

  // Whole-set counts, not page-bound - the tabs describe the queue.
  const grouped = (await db("payout_runs").groupBy("status").select("status").count("id as count")) as Array<{
    status: PayoutRunStatus;
    count: string;
  }>;
  const counts: Record<PayoutRunStatus, number> = { scheduled: 0, processing: 0, paid: 0, failed: 0 };
  for (const g of grouped) counts[g.status] = Number(g.count);

  return { ...page, data: await decorate(page.data), counts };
}

export async function getRun(id: string): Promise<RunDetail> {
  const run = (await db<PayoutRunRow>("payout_runs").where({ id }).first()) as PayoutRunRow | undefined;
  if (!run) {
    throw new ApiError({ status: 404, type: "not_found", code: "payout_run_not_found", message: "No such payout run." });
  }
  const [item] = await decorate([run]);
  const lines = (await db<PayoutRunLineRow>("payout_run_lines")
    .where({ payout_run_id: id })
    .orderBy("dropoff_at", "asc")
    .select("*")) as PayoutRunLineRow[];
  const attempts = (await db<DisbursementRow>("disbursements")
    .where({ payout_run_id: id })
    .orderBy("created_at", "desc")
    .select("*")) as DisbursementRow[];

  return {
    ...item!,
    lines: lines.map((l) => ({
      id: l.id,
      booking_id: l.booking_id,
      booking_ref: l.booking_ref,
      hirer_name: l.hirer_name,
      vehicle_registration: l.vehicle_registration,
      pickup_at: new Date(l.pickup_at).toISOString(),
      dropoff_at: new Date(l.dropoff_at).toISOString(),
      gross: kes(l.gross_amount),
      commission: kes(l.commission_amount),
      net: kes(l.net_amount),
    })),
    attempts: attempts.map(attemptView),
    can_pay: (run.status === "scheduled" || run.status === "failed") && railReady(),
  };
}

/**
 * Finance's Pay. Writes the attempt and moves the run to `processing` in
 * one transaction (audited, actor = the admin), then sends after commit.
 * Refused outright when there is no real rail in production, so a run is
 * never pushed into `processing` -> `failed` by a misconfiguration.
 */
export async function payRun(id: string, ctx: AdminContextInput): Promise<RunDetail> {
  if (!railReady()) {
    throw new ApiError({
      status: 503,
      type: "server_error",
      code: "payout_rail_unconfigured",
      message: "No payout rail is configured on this server (DISBURSEMENT_ADAPTER=console). Nothing was sent.",
    });
  }
  const disbursementId = await db.transaction((trx) =>
    createPayoutDisbursement(trx, id, {
      actorId: ctx.adminId,
      actorType: "admin",
      requestId: ctx.requestId,
      ip: ctx.ip,
    }),
  );
  const run = (await db<PayoutRunRow>("payout_runs").where({ id }).first()) as PayoutRunRow;
  await sendDisbursement(disbursementId, `CRAL payout ${run.ref}`);
  return getRun(id);
}

/**
 * "Cut now" - a run for one merchant today, without waiting for their
 * scheduled day. Same `cutPayoutRun` rules; 409 when nothing is payable.
 */
export async function cutRunNow(input: CutRunInput): Promise<RunDetail> {
  const run = await cutRunForMerchant(input.merchant_id, nairobiDay(new Date()));
  if (!run) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "nothing_payable",
      message: "This merchant has no completed, cleared hires waiting to be paid.",
    });
  }
  return getRun(run.id);
}

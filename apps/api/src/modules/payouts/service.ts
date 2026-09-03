import type { Knex } from "knex";
import { ApiError, kes, type PaginatedResult } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { emailAdapter } from "../../lib/adapters.js";
import { emailHeading, emailLayout, emailMuted, emailParagraph } from "../../lib/email-templates.js";
import { getOrCreateMerchant, type RequestContext } from "../merchant/service.js";
import { notify } from "../../lib/notifications.js";
import type { BookingRow } from "../bookings/db-types.js";
import type { PayoutQueryRow, PayoutRunLineRow, PayoutRunRow } from "./db-types.js";
import type { CreatePayoutQueryInput, ListPayoutsQuery } from "./schemas.js";

/**
 * Where a payout query lands. Not a merchant-visible address — this is
 * CRAL's own support inbox, so it is config, not data.
 */
const SUPPORT_EMAIL = process.env.PAYOUT_SUPPORT_EMAIL ?? "support@cral.co.ke";

function notFound(): never {
  throw new ApiError({
    status: 404,
    type: "not_found",
    code: "payout_run_not_found",
    message: "That payout doesn't exist on your account.",
  });
}

// ---------------------------------------------------------------------
// Nairobi day/week helpers
//
// Payouts are a banking rhythm, not an instant: a run belongs to a Nairobi
// calendar day and the chart buckets by Nairobi week. Spec §2 allows local
// time exactly here — for display and day-boundary logic — so these convert
// at the edges and never store a local value.
// ---------------------------------------------------------------------

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The Nairobi calendar day an instant falls on, as "YYYY-MM-DD". */
function nairobiDay(instant: Date): string {
  return new Date(instant.getTime() + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight Nairobi on `day`, as the UTC instant it corresponds to. */
function nairobiDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - NAIROBI_OFFSET_MS);
}

/** The next Monday on or after `from`, in Nairobi, as "YYYY-MM-DD". */
function nextMonday(from: Date): string {
  const shifted = new Date(from.getTime() + NAIROBI_OFFSET_MS);
  const dow = (shifted.getUTCDay() + 6) % 7;
  shifted.setUTCDate(shifted.getUTCDate() + (dow === 0 ? 0 : 7 - dow));
  return shifted.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Refs
// ---------------------------------------------------------------------

/**
 * `PAY-0912` — a human reference the merchant reads aloud to support, not a
 * PK. Same sequence pattern as `booking_ref_seq`, zero-padded to four so the
 * refs sort and read the way the design's do.
 */
async function nextPayoutRef(trx: Knex.Transaction | Knex): Promise<string> {
  const result = await trx.raw<{ rows: { n: string }[] }>("select nextval('payout_run_ref_seq') as n");
  return `PAY-${String(result.rows[0]!.n).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------

function serializeRun(run: PayoutRunRow, lineCount: number) {
  return {
    id: run.id,
    ref: run.ref,
    status: run.status,
    run_date: run.run_date,
    gross: { amount: run.gross_amount, currency: run.gross_currency },
    commission: { amount: run.commission_amount, currency: run.commission_currency },
    net: { amount: run.net_amount, currency: run.net_currency },
    line_count: lineCount,
    provider_code: run.provider_code,
    paid_at: run.paid_at ? run.paid_at.toISOString() : null,
  };
}

function serializeLine(line: PayoutRunLineRow) {
  return {
    id: line.id,
    booking_id: line.booking_id,
    booking_ref: line.booking_ref,
    hirer_name: line.hirer_name,
    vehicle_registration: line.vehicle_registration,
    pickup_at: line.pickup_at.toISOString(),
    dropoff_at: line.dropoff_at.toISOString(),
    gross: { amount: line.gross_amount, currency: line.gross_currency },
    commission: { amount: line.commission_amount, currency: line.commission_currency },
    net: { amount: line.net_amount, currency: line.net_currency },
  };
}

function serializeQuery(row: PayoutQueryRow) {
  return {
    id: row.id,
    payout_run_id: row.payout_run_id,
    message: row.message,
    status: row.status,
    response: row.response,
    created_at: row.created_at.toISOString(),
  };
}

function destinationOf(run: PayoutRunRow) {
  return {
    method: run.destination_method,
    detail: run.destination_detail,
    account_name: run.destination_account_name,
  };
}

/** Display-only formatting for the composed footnote and the PDF/CSV. */
function formatAmount(cents: number): string {
  return Math.round(cents / 100).toLocaleString("en-KE");
}

function formatNairobiTime(instant: Date): string {
  return new Date(instant.getTime() + NAIROBI_OFFSET_MS).toISOString().slice(11, 16);
}

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function weekdayOf(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long" });
}

/**
 * The sentence under a run's totals. Composed server-side so the wording a
 * merchant reads is the same wording support sees when they pull the run —
 * a footnote assembled in the client would drift between the two.
 */
function composeFootnote(run: PayoutRunRow, lineCount: number): string {
  const hires = `${lineCount} completed ${lineCount === 1 ? "hire" : "hires"}`;
  switch (run.status) {
    case "paid":
      return run.paid_at
        ? `Sent to M-Pesa ${run.destination_detail} at ${formatNairobiTime(run.paid_at)}. ${hires} in one run.`
        : `Sent to M-Pesa ${run.destination_detail}. ${hires} in one run.`;
    case "processing":
      return `On its way to M-Pesa ${run.destination_detail}. Safaricom usually confirms within a few minutes.`;
    case "failed":
      return `This run did not go through. CRAL support is looking into it. Raise a query below if you need an update.`;
    case "scheduled":
    default:
      return `This run goes out on ${weekdayOf(run.run_date)} morning. Anything returned and cleared before the night before joins it automatically.`;
  }
}

// ---------------------------------------------------------------------
// Cutting a run
// ---------------------------------------------------------------------

/**
 * Bookings that are payable but not yet on any run: completed, and the
 * deposit hold has been released so nothing can still be claimed against
 * them. The `payout_run_lines` left join is what makes a booking pay out
 * exactly once; the unique index on `booking_id` is what makes that true
 * under concurrency rather than just usually.
 */
async function payableBookings(trx: Knex.Transaction | Knex, merchantId: string): Promise<BookingRow[]> {
  return trx<BookingRow>("bookings")
    .leftJoin("payout_run_lines", "payout_run_lines.booking_id", "bookings.id")
    .where("bookings.merchant_id", merchantId)
    .where("bookings.status", "completed")
    .where("bookings.deposit_released", true)
    .whereNull("payout_run_lines.id")
    .orderBy("bookings.dropoff_at", "asc")
    .select("bookings.*");
}

export interface CutRunOptions {
  /** Nairobi day the run goes out. Defaults to the next Monday. */
  runDate?: string;
  /** Only used by the dev-seed and, later, a settled Daraja callback. */
  markPaid?: { providerCode: string; paidAt: Date };
  bookingIds?: string[];
}

/**
 * Groups a merchant's payable bookings into one run. Exported because the
 * dev-seed and (later) a scheduled job both need it, and because it is the
 * single place that decides what a run contains — a second copy of these
 * rules is how a merchant ends up paid twice.
 *
 * Returns null when there is nothing to pay: an empty run is not a
 * meaningful record, and it would show the merchant a KES 0 line they have
 * to reason about.
 */
export async function cutPayoutRun(
  trx: Knex.Transaction,
  merchantId: string,
  destination: { method: string; detail: string; accountName: string },
  options: CutRunOptions = {},
): Promise<PayoutRunRow | null> {
  let bookings = await payableBookings(trx, merchantId);
  if (options.bookingIds) {
    const wanted = new Set(options.bookingIds);
    bookings = bookings.filter((b) => wanted.has(b.id));
  }
  if (bookings.length === 0) return null;

  const hirerIds = [...new Set(bookings.map((b) => b.hirer_id))];
  const vehicleIds = [...new Set(bookings.map((b) => b.vehicle_id))];
  const hirers = await trx("users").whereIn("id", hirerIds).select("id", "full_name");
  const vehicles = await trx("vehicles").whereIn("id", vehicleIds).select("id", "registration");
  const hirerName = new Map(hirers.map((h) => [h.id as string, (h.full_name as string | null) ?? "Hirer"]));
  const registration = new Map(vehicles.map((v) => [v.id as string, v.registration as string]));

  // Totals are the sum of the line snapshots, never a fresh multiply by
  // COMMISSION_RATE — see the contract's money note.
  const gross = bookings.reduce((sum, b) => sum + b.gross_amount, 0);
  const commission = bookings.reduce((sum, b) => sum + b.commission_amount, 0);
  const net = bookings.reduce((sum, b) => sum + b.merchant_net_amount, 0);

  const runId = generateId("payoutRun");
  const runDate = options.runDate ?? nextMonday(new Date());

  const [run] = await trx<PayoutRunRow>("payout_runs")
    .insert({
      id: runId,
      ref: await nextPayoutRef(trx),
      merchant_id: merchantId,
      status: options.markPaid ? "paid" : "scheduled",
      run_date: runDate,
      gross_amount: gross,
      gross_currency: "KES",
      commission_amount: commission,
      commission_currency: "KES",
      net_amount: net,
      net_currency: "KES",
      destination_method: destination.method,
      destination_detail: destination.detail,
      destination_account_name: destination.accountName,
      provider_code: options.markPaid?.providerCode ?? null,
      paid_at: options.markPaid?.paidAt ?? null,
    })
    .returning("*");

  // Same transaction as the run itself, per lib/notifications.ts. Delivery
  // (SMS/email) is not enqueued here — `cutPayoutRun` takes a `trx`, not a
  // post-commit hook, and today its only caller is the dev-seed. The real
  // caller is a Daraja B2C callback that doesn't exist yet; that is where
  // `enqueueNotificationDelivery` gets wired, alongside the `paid`
  // transition. The in-app feed row is written now regardless.
  await notify(trx, {
    merchantId: merchantId,
    category: "payout",
    title: options.markPaid
      ? `${run!.ref} · payout sent · KES ${formatAmount(net)}`
      : `${run!.ref} · payout scheduled · KES ${formatAmount(net)}`,
    body: options.markPaid
      ? `${bookings.length} finished ${bookings.length === 1 ? "hire" : "hires"} cleared to M-Pesa ${destination.detail}. Safaricom code ${options.markPaid.providerCode}.`
      : `Goes out ${weekdayOf(runDate)} to M-Pesa ${destination.detail}. Anything returned and cleared before then joins it.`,
    ref: run!.ref,
    subjectType: "payout_run",
    subjectId: runId,
    ...(options.markPaid ? { occurredAt: options.markPaid.paidAt } : {}),
  });

  await trx<PayoutRunLineRow>("payout_run_lines").insert(
    bookings.map((b) => ({
      id: generateId("payoutRunLine"),
      payout_run_id: runId,
      booking_id: b.id,
      booking_ref: b.ref,
      hirer_name: hirerName.get(b.hirer_id) ?? "Hirer",
      vehicle_registration: registration.get(b.vehicle_id) ?? "—",
      pickup_at: b.pickup_at,
      dropoff_at: b.dropoff_at,
      gross_amount: b.gross_amount,
      gross_currency: b.gross_currency,
      commission_amount: b.commission_amount,
      commission_currency: b.commission_currency,
      net_amount: b.merchant_net_amount,
      net_currency: b.merchant_net_currency,
    })),
  );

  return run!;
}

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

async function lineCounts(runIds: string[]): Promise<Map<string, number>> {
  if (runIds.length === 0) return new Map();
  const rows = await db("payout_run_lines")
    .whereIn("payout_run_id", runIds)
    .groupBy("payout_run_id")
    .select("payout_run_id")
    .count<{ payout_run_id: string; count: string }[]>("id as count");
  return new Map(rows.map((r) => [r.payout_run_id, Number(r.count)]));
}

/**
 * The three tiles, the chart and the destination that sit above the payout
 * history table. Computed rather than stored — `next_payout` in particular
 * is a projection over bookings that have not been cut into a run yet, and
 * storing a projection means owning a reconciliation job that doesn't exist.
 */
async function buildSummary(merchantId: string, destination: { method: string; detail: string; accountName: string }) {
  const now = new Date();

  // "Next payout" is everything owed but not yet sent: runs already cut and
  // waiting to go out, plus payable bookings no run has picked up yet. The
  // design shows the tile and the scheduled run carrying the same figure —
  // counting only one of the two would make the tile disagree with the row
  // directly beneath it.
  const pendingRuns = await db<PayoutRunRow>("payout_runs")
    .where({ merchant_id: merchantId })
    .whereIn("status", ["scheduled", "processing"])
    .select("*");
  const pendingLineCounts = await lineCounts(pendingRuns.map((r) => r.id));

  const payable = await payableBookings(db, merchantId);
  const nextPayoutAmount =
    payable.reduce((sum, b) => sum + b.merchant_net_amount, 0) +
    pendingRuns.reduce((sum, r) => sum + r.net_amount, 0);

  // Money that will become payable but isn't yet: the hire is still running,
  // or it finished and the deposit hold hasn't lapsed.
  const clearingRows = await db<BookingRow>("bookings")
    .where({ merchant_id: merchantId })
    .where((q) =>
      q
        .whereIn("status", ["confirmed", "active"])
        .orWhere((inner) => inner.where("status", "completed").where("deposit_released", false)),
    )
    .select("merchant_net_amount", "status");
  const clearingAmount = clearingRows.reduce((sum, b) => sum + b.merchant_net_amount, 0);
  const onHireCount = clearingRows.filter((b) => b.status === "active").length;

  const monthStart = nairobiDayStart(`${nairobiDay(now).slice(0, 7)}-01`);
  const paidRuns = await db<PayoutRunRow>("payout_runs")
    .where({ merchant_id: merchantId, status: "paid" })
    .whereNotNull("paid_at")
    .select("net_amount", "paid_at");
  const paidThisMonth = paidRuns
    .filter((r) => r.paid_at !== null && r.paid_at >= monthStart)
    .reduce((sum, r) => sum + r.net_amount, 0);

  const allRuns = await db<PayoutRunRow>("payout_runs").where({ merchant_id: merchantId }).select("net_amount");

  const nextHires =
    payable.length + pendingRuns.reduce((sum, r) => sum + (pendingLineCounts.get(r.id) ?? 0), 0);
  // The soonest run already on the books wins; otherwise the next Monday, and
  // only when there is actually something to send.
  const scheduledDates = pendingRuns.map((r) => r.run_date).sort();
  const nextDate = scheduledDates[0] ?? (nextPayoutAmount > 0 ? nextMonday(now) : null);

  return {
    tiles: [
      {
        key: "next_payout" as const,
        amount: kes(nextPayoutAmount),
        note: nextDate
          ? `${nextHires} ${nextHires === 1 ? "hire" : "hires"} · ${weekdayOf(nextDate)} ${formatDay(nextDate).replace(/ \d{4}$/, "")}`
          : "Nothing waiting to go out",
      },
      {
        key: "clearing" as const,
        amount: kes(clearingAmount),
        note:
          onHireCount > 0
            ? `${onHireCount} ${onHireCount === 1 ? "vehicle" : "vehicles"} still out on hire`
            : "Nothing on hire right now",
      },
      {
        key: "paid_this_month" as const,
        amount: kes(paidThisMonth),
        note: `${paidRuns.filter((r) => r.paid_at !== null && r.paid_at >= monthStart).length} runs · after commission`,
      },
    ],
    run_count: allRuns.length,
    net_total: kes(allRuns.reduce((sum, r) => sum + r.net_amount, 0)),
    destination: { method: destination.method, detail: destination.detail, account_name: destination.accountName },
    next_run_date: nextDate,
  };
}

/**
 * The merchant's payout destination. Read from the user's payout phone
 * rather than a payouts-owned column so it cannot drift from the number
 * onboarding verified. Read-only — see the contract's destination note.
 */
async function destinationFor(userId: string): Promise<{ method: string; detail: string; accountName: string }> {
  const user = await db("users").where({ id: userId }).first("phone", "full_name");
  return {
    method: "mpesa",
    detail: user?.phone ?? "—",
    accountName: user?.full_name ?? "—",
  };
}

export async function listPayouts(userId: string, query: ListPayoutsQuery) {
  const merchant = await getOrCreateMerchant(userId);
  const destination = await destinationFor(userId);

  const rows = await applyCursor(
    db<PayoutRunRow>("payout_runs").where({ merchant_id: merchant.id }).select("*"),
    {
      sortColumn: "run_date",
      direction: "desc",
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    },
  );

  const page: PaginatedResult<PayoutRunRow> = toPaginatedResult(rows, query.limit, "run_date");
  const counts = await lineCounts(page.data.map((r) => r.id));

  return {
    data: page.data.map((run) => serializeRun(run, counts.get(run.id) ?? 0)),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
    summary: await buildSummary(merchant.id, destination),
  };
}

async function requireOwnRun(userId: string, payoutRunId: string): Promise<PayoutRunRow> {
  const merchant = await getOrCreateMerchant(userId);
  const run = await db<PayoutRunRow>("payout_runs").where({ id: payoutRunId, merchant_id: merchant.id }).first();
  if (!run) notFound();
  return run;
}

export async function getPayoutDetail(userId: string, payoutRunId: string) {
  const run = await requireOwnRun(userId, payoutRunId);
  const lines = await db<PayoutRunLineRow>("payout_run_lines")
    .where({ payout_run_id: run.id })
    .orderBy("dropoff_at", "asc")
    .select("*");
  const openQueries = await db("payout_queries")
    .where({ payout_run_id: run.id, status: "filed" })
    .count<{ count: string }[]>("id as count");

  return {
    ...serializeRun(run, lines.length),
    destination: destinationOf(run),
    lines: lines.map(serializeLine),
    footnote: composeFootnote(run, lines.length),
    open_query_count: Number(openQueries[0]?.count ?? 0),
  };
}

// ---------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------

export interface RunDocument {
  body: Buffer;
  contentType: string;
  filename: string;
}

export async function buildReceipt(userId: string, payoutRunId: string): Promise<RunDocument> {
  const run = await requireOwnRun(userId, payoutRunId);
  const lines = await db<PayoutRunLineRow>("payout_run_lines")
    .where({ payout_run_id: run.id })
    .orderBy("dropoff_at", "asc")
    .select("*");

  const { renderReceiptPdf } = await import("./receipt-pdf.js");
  const body = await renderReceiptPdf(run, lines, composeFootnote(run, lines.length));
  return { body, contentType: "application/pdf", filename: `${run.ref}-receipt.pdf` };
}

/** RFC 4180 quoting — a hirer's name with a comma must not shift a column. */
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function buildStatement(userId: string, month: string): Promise<RunDocument> {
  const merchant = await getOrCreateMerchant(userId);

  // Month boundaries in Nairobi: a run cut at 00:30 EAT on the 1st belongs
  // to the new month, which a naive UTC comparison would put in the old one.
  const start = nairobiDayStart(`${month}-01`);
  const nextMonthNum = Number(month.slice(5, 7)) % 12 + 1;
  const nextYear = Number(month.slice(0, 4)) + (nextMonthNum === 1 ? 1 : 0);
  const end = nairobiDayStart(`${nextYear}-${String(nextMonthNum).padStart(2, "0")}-01`);

  const runs = await db<PayoutRunRow>("payout_runs")
    .where({ merchant_id: merchant.id })
    .where("run_date", ">=", nairobiDay(start))
    .where("run_date", "<", nairobiDay(end))
    .orderBy("run_date", "asc")
    .select("*");

  const lines = runs.length
    ? await db<PayoutRunLineRow>("payout_run_lines")
        .whereIn("payout_run_id", runs.map((r) => r.id))
        .orderBy("dropoff_at", "asc")
        .select("*")
    : [];
  const runById = new Map(runs.map((r) => [r.id, r]));

  const header = [
    "Payout ref",
    "Run date",
    "Status",
    "M-Pesa code",
    "Booking ref",
    "Hirer",
    "Vehicle",
    "Pick-up",
    "Drop-off",
    "Gross (KES)",
    "Commission (KES)",
    "Net (KES)",
  ];

  const body = lines.map((line) => {
    const run = runById.get(line.payout_run_id)!;
    return [
      run.ref,
      run.run_date,
      run.status,
      run.provider_code ?? "",
      line.booking_ref,
      line.hirer_name,
      line.vehicle_registration,
      line.pickup_at.toISOString().slice(0, 10),
      line.dropoff_at.toISOString().slice(0, 10),
      (line.gross_amount / 100).toFixed(2),
      (line.commission_amount / 100).toFixed(2),
      (line.net_amount / 100).toFixed(2),
    ];
  });

  // A month with no runs still gets a header and a zeroed total — an empty
  // statement is a real answer, and a merchant needs to be able to file it.
  const totals = ["TOTAL", "", "", "", "", "", "", "", ""];
  totals.push(
    (lines.reduce((s, l) => s + l.gross_amount, 0) / 100).toFixed(2),
    (lines.reduce((s, l) => s + l.commission_amount, 0) / 100).toFixed(2),
    (lines.reduce((s, l) => s + l.net_amount, 0) / 100).toFixed(2),
  );

  const csv = [header, ...body, totals].map((row) => row.map(csvCell).join(",")).join("\r\n");

  return {
    // Excel needs a UTF-8 BOM to read accented hirer names correctly.
    // Written as an escape, not the literal character, so it stays
    // visible in a diff and does not trip no-irregular-whitespace.
    body: Buffer.from(`\uFEFF${csv}\r\n`, "utf8"),
    contentType: "text/csv; charset=utf-8",
    filename: `cral-statement-${month}.csv`,
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-07" → "July 2026". Fixed table, no locale or timezone in play. */
function monthLabel(month: string): string {
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month.slice(5, 7);
  return `${name} ${month.slice(0, 4)}`;
}

/**
 * The Statements card on Settings → Payouts: the last six Nairobi calendar
 * months that have at least one payout run, each with its net-of-commission
 * total. The per-month CSV is still downloaded through
 * `GET /merchant/payouts/statement?month=`; this only supplies the amounts
 * the card shows, which nothing returned before.
 *
 * Net is summed from `payout_runs.net_amount` — itself the sum of that
 * run's line snapshots — so a later COMMISSION_RATE change can't rewrite a
 * month a merchant was already paid.
 */
export async function listStatements(userId: string) {
  const merchant = await getOrCreateMerchant(userId);
  const runs = await db<PayoutRunRow>("payout_runs")
    .where({ merchant_id: merchant.id })
    .orderBy("run_date", "desc")
    .select("run_date", "net_amount");

  const byMonth = new Map<string, number>();
  for (const run of runs) {
    const month = String(run.run_date).slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + run.net_amount);
  }

  const data = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 6)
    .map(([month, amount]) => ({ month, label: monthLabel(month), net: kes(amount) }));

  return { data };
}

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

export async function listPayoutQueries(userId: string, payoutRunId: string) {
  const run = await requireOwnRun(userId, payoutRunId);
  const rows = await db<PayoutQueryRow>("payout_queries")
    .where({ payout_run_id: run.id })
    .orderBy("created_at", "desc")
    .select("*");
  return { data: rows.map(serializeQuery) };
}

export async function createPayoutQuery(
  userId: string,
  payoutRunId: string,
  input: CreatePayoutQueryInput,
  ctx: RequestContext,
) {
  const merchant = await getOrCreateMerchant(userId);
  const run = await db<PayoutRunRow>("payout_runs").where({ id: payoutRunId, merchant_id: merchant.id }).first();
  if (!run) notFound();

  const id = generateId("payoutQuery");
  const row = await db.transaction(async (trx) => {
    const [inserted] = await trx<PayoutQueryRow>("payout_queries")
      .insert({
        id,
        payout_run_id: run.id,
        merchant_id: merchant.id,
        message: input.message,
        status: "filed",
        response: null,
      })
      .returning("*");

    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "payout_query.created",
      entityType: "payout_run",
      entityId: run.id,
      after: { query_id: id, message: input.message },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return inserted!;
  });

  // After the commit, deliberately. A bounced support email must not lose
  // the merchant's query — the row is the record, the mail is a courtesy.
  try {
    await emailAdapter.send({
      to: SUPPORT_EMAIL,
      subject: `Payout query · ${run.ref} · ${merchant.id}`,
      html: emailLayout({
        preheader: `A merchant has queried ${run.ref}.`,
        bodyHtml: [
          emailHeading("Payout query"),
          emailParagraph(`${run.ref}: KES ${formatAmount(run.net_amount)} net, run date ${run.run_date}, status ${run.status}.`),
          emailParagraph(input.message),
          emailMuted(`Merchant ${merchant.id} · user ${userId} · query ${id}`),
        ].join(""),
      }),
    });
  } catch (error) {
    // Logged, not rethrown: the query is already recorded and the merchant
    // has been told so. Support can still see it in the table.
    console.error("payout query support email failed", { queryId: id, error });
  }

  return serializeQuery(row);
}

// Shared with the receipt renderer so a merchant's PDF and their screen
// format the same numbers the same way.
export { formatAmount, formatDay, nairobiDay, nextMonday };

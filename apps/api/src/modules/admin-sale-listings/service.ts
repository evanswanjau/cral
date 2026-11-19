import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { notify } from "../../lib/notifications.js";
import { enqueueNotificationDelivery } from "../../jobs/notification-delivery.js";
import { merchantDisplayName } from "../../lib/merchant-display.js";
import {
  checklistSnapshot,
  flaggedItems,
  getSaleChecklistDefinition,
  loadRows,
  mergeChecklist,
  toBlock,
  unanswered,
  upsertCheck,
  type CheckResult,
  type ChecklistDocContext,
} from "../../lib/review-checklist.js";
import { readSaleFile, saleFiles, serializeSaleListing, type SaleListingFileRow, type SaleListingRow } from "../sale-listings/service.js";
import { MIN_SALE_PHOTOS, type SaleStatus } from "../sale-listings/schemas.js";
import type { MerchantRow } from "../merchant/db-types.js";
import type { AdminContextInput } from "../admin-vehicles/service.js";

/**
 * Ops review of sale listings and the reported-listing queue (Phase 6 CS2 -
 * docs/decisions/car-sales.md, openapi/admin-sales.yaml). Checklist-first
 * on the shared `lib/review-checklist.ts` engine, shaped like the outlet
 * review. The logbook checks are a person comparing the upload with the
 * listing and the account; nothing here reads the logbook automatically.
 */

const DECIDABLE: SaleStatus[] = ["pending", "review"];
const OPEN: SaleStatus[] = ["live", "paused"];

const FILTER_STATUSES: Record<string, SaleStatus[]> = {
  all: ["pending", "review", "action", "rejected", "live", "paused", "sold", "withdrawn"],
  open: ["pending", "review"],
  changes_sent: ["action"],
  live: ["live", "paused"],
  rejected: ["rejected"],
  closed: ["sold", "withdrawn"],
};
export const SALE_QUEUE_FILTERS = Object.keys(FILTER_STATUSES);
export const REPORT_FILTERS = ["open", "handled", "all"] as const;

function invalid(code: string, message: string, field?: string): never {
  throw new ApiError({ status: 422, type: "validation_error", code, message, ...(field ? { field } : {}) });
}

function conflict(code: string, message: string): never {
  throw new ApiError({ status: 409, type: "conflict", code, message });
}

function notInReview(): never {
  conflict("sale_listing_not_in_review", "This listing isn't waiting for a decision any more. Reload the case.");
}

const titleOf = (l: Pick<SaleListingRow, "year" | "make" | "model">) => `${l.year} ${l.make} ${l.model}`;

async function adminNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  const rows = await db<{ id: string; full_name: string }>("admin_users").whereIn("id", want).select("id", "full_name");
  return new Map(rows.map((a) => [a.id, a.full_name]));
}

async function openReportCounts(listingIds: string[]): Promise<Map<string, number>> {
  if (!listingIds.length) return new Map();
  const rows = await db("sale_listing_reports")
    .whereIn("sale_listing_id", listingIds)
    .andWhere({ status: "open" })
    .groupBy("sale_listing_id")
    .select("sale_listing_id")
    .count<{ sale_listing_id: string; count: string }[]>("* as count");
  return new Map(rows.map((r) => [r.sale_listing_id, Number(r.count)]));
}

async function requireCase(listingId: string): Promise<{ listing: SaleListingRow; merchant: MerchantRow }> {
  const listing = await db<SaleListingRow>("sale_listings").where({ id: listingId }).first();
  if (!listing || listing.status === "draft") {
    throw new ApiError({ status: 404, type: "not_found", code: "review_case_not_found", message: "No review case for that listing." });
  }
  const merchant = await db<MerchantRow>("merchants").where({ id: listing.merchant_id }).first();
  if (!merchant) throw new Error(`sale listing ${listingId} has no merchant row`);
  return { listing, merchant };
}

// ---------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------

/**
 * Every answer goes stale on a new submission (the merchant may have
 * changed the plate, the logbook or the photos), and photo / logbook
 * answers also when a newer file of that kind arrives.
 */
function contextFor(listing: SaleListingRow, files: SaleListingFileRow[]): ChecklistDocContext {
  const uploadedAt = new Map<string, Date>();
  const bump = (key: string, d: Date | null) => {
    if (!d) return;
    const prev = uploadedAt.get(key);
    if (!prev || d > prev) uploadedAt.set(key, d);
  };
  for (const key of ["logbook", "photos"]) bump(key, listing.submitted_at);
  for (const f of files) bump(f.kind === "logbook" ? "logbook" : "photos", f.created_at);
  return { uploadedAt, rejected: new Set() };
}

async function saleChecklist(listing: SaleListingRow, files: SaleListingFileRow[]) {
  const [def, rows] = await Promise.all([
    getSaleChecklistDefinition(),
    loadRows("sale_listing_review_checks", "sale_listing_id", listing.id),
  ]);
  const merged = mergeChecklist(def, rows, contextFor(listing, files));
  return { merged, block: toBlock(merged) };
}

// ---------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------

export async function listSaleQueue(query: { filter: string; cursor?: string | undefined; limit: number }) {
  const statuses = FILTER_STATUSES[query.filter] ?? FILTER_STATUSES.all!;
  const total = Number(
    (await db("sale_listings").whereIn("status", statuses).count<{ count: string }[]>("* as count"))[0]?.count ?? 0,
  );
  const rows = (await applyCursor(db<SaleListingRow>("sale_listings").whereIn("status", statuses).select("*"), {
    sortColumn: "submitted_at",
    direction: "asc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  })) as SaleListingRow[];
  const paged = toPaginatedResult(rows, query.limit, "submitted_at");
  const merchants = await db<MerchantRow>("merchants").whereIn("id", [...new Set(paged.data.map((l) => l.merchant_id))]);
  const names = await adminNames(paged.data.map((l) => l.review_assignee));
  const reports = await openReportCounts(paged.data.map((l) => l.id));

  return {
    data: paged.data.map((l) => {
      const m = merchants.find((x) => x.id === l.merchant_id);
      return {
        id: l.id,
        ref: l.ref,
        title: titleOf(l),
        registration: l.registration,
        county: l.county,
        asking_price: { amount: Number(l.asking_price_amount), currency: l.asking_price_currency },
        status: l.status,
        merchant_id: l.merchant_id,
        merchant_name: m ? merchantDisplayName(m) : "",
        merchant_approved: Boolean(m?.approved_at),
        assignee_name: l.review_assignee ? (names.get(l.review_assignee) ?? null) : null,
        open_reports: reports.get(l.id) ?? 0,
        submitted_at: l.submitted_at ? l.submitted_at.toISOString() : null,
      };
    }),
    next_cursor: paged.next_cursor,
    has_more: paged.has_more,
    total,
  };
}

// ---------------------------------------------------------------------
// Case
// ---------------------------------------------------------------------

async function serializeCase(listing: SaleListingRow, merchant: MerchantRow) {
  const files = (await saleFiles([listing.id])).get(listing.id) ?? [];
  const { block } = await saleChecklist(listing, files);
  const names = await adminNames([listing.review_assignee]);
  const reports = await openReportCounts([listing.id]);
  const base = serializeSaleListing(listing, files);
  const typeOf = new Map(files.map((f) => [f.id, f.content_type]));
  const withType = <T extends { id: string }>(f: T) => ({ ...f, content_type: typeOf.get(f.id) ?? "" });
  return {
    ...base,
    photos: base.photos.map(withType),
    logbook: base.logbook ? withType(base.logbook) : null,
    assignee: listing.review_assignee ? { id: listing.review_assignee, name: names.get(listing.review_assignee) ?? "" } : null,
    merchant: {
      id: merchant.id,
      name: merchantDisplayName(merchant),
      owner_type: merchant.owner_type,
      approved: merchant.approved_at !== null,
    },
    open_reports: reports.get(listing.id) ?? 0,
    checklist: block,
  };
}

export async function getSaleCase(listingId: string) {
  const { listing, merchant } = await requireCase(listingId);
  return serializeCase(listing, merchant);
}

export async function readCaseFile(listingId: string, fileId: string) {
  await requireCase(listingId);
  return readSaleFile(listingId, fileId);
}

/** `force` (the explicit "Assign to me") takes the case from anyone; working a case claims only an unassigned or pending one. */
async function claim(listing: SaleListingRow, admin: AdminContextInput, force: boolean): Promise<SaleListingRow> {
  if (!DECIDABLE.includes(listing.status)) return listing;
  if (!force && listing.status !== "pending" && listing.review_assignee !== null) return listing;
  const assignee = force ? admin.adminId : (listing.review_assignee ?? admin.adminId);
  if (assignee === listing.review_assignee && listing.status === "review") return listing;
  return db.transaction(async (trx) => {
    const [row] = await trx<SaleListingRow>("sale_listings")
      .where({ id: listing.id, status: listing.status })
      .update({ review_assignee: assignee, status: "review", updated_at: new Date() })
      .returning("*");
    if (!row) notInReview();
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: "sale_listing.assigned",
      entityType: "sale_listing",
      entityId: listing.id,
      before: { status: listing.status, review_assignee: listing.review_assignee },
      after: { status: "review", review_assignee: assignee },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    return row;
  });
}

export async function assignSale(listingId: string, admin: AdminContextInput) {
  const { listing, merchant } = await requireCase(listingId);
  if (!DECIDABLE.includes(listing.status)) notInReview();
  return serializeCase(await claim(listing, admin, true), merchant);
}

export async function setSaleCheck(
  listingId: string,
  input: { item_id: string; result: CheckResult; note?: string | null | undefined },
  admin: AdminContextInput,
) {
  const { listing: found, merchant } = await requireCase(listingId);
  if (!DECIDABLE.includes(found.status)) notInReview();
  const def = await getSaleChecklistDefinition();
  if (!def.some((it) => it.id === input.item_id)) {
    invalid("unknown_checklist_item", `No checklist item "${input.item_id}".`, "item_id");
  }
  const listing = await claim(found, admin, false);
  const note = input.note?.trim() || null;
  await db.transaction(async (trx) => {
    await upsertCheck("sale_listing_review_checks", { sale_listing_id: listing.id }, input.item_id, input.result, note, admin.adminId, trx);
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: "sale_listing.check_answered",
      entityType: "sale_listing",
      entityId: listing.id,
      after: { item_id: input.item_id, result: input.result, note },
      requestId: admin.requestId,
      ip: admin.ip,
    });
  });
  const fresh = await db<SaleListingRow>("sale_listings").where({ id: listing.id }).first();
  return serializeCase(fresh!, merchant);
}

// ---------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------

export type SaleAction = "approve" | "request_changes" | "reject";

export async function decideSale(listingId: string, action: SaleAction, note: string | null, admin: AdminContextInput) {
  const { listing, merchant } = await requireCase(listingId);
  if (!DECIDABLE.includes(listing.status)) notInReview();
  const text = note?.trim() ?? "";
  if (action !== "approve" && !text) invalid("reason_required", "Write what the merchant should read.", "note");

  const files = (await saleFiles([listing.id])).get(listing.id) ?? [];
  const { merged } = await saleChecklist(listing, files);
  const open = unanswered(merged);
  if (open.length) {
    invalid("checklist_incomplete", `Answer every check first - still open: ${open.map((m) => m.label).join(", ")}.`);
  }
  if (action === "approve") {
    if (flaggedItems(merged).length) invalid("checklist_flagged", "Flagged checks can't be approved. Request changes or reject instead.");
    if (merchant.approved_at === null) {
      invalid("merchant_not_approved", "Approve the merchant's account on the merchant file before approving its listing.");
    }
    if (files.filter((f) => f.kind === "photo").length < MIN_SALE_PHOTOS) {
      invalid("photos_required", `A listing needs at least ${MIN_SALE_PHOTOS} photos.`);
    }
    if (!files.some((f) => f.kind === "logbook")) invalid("logbook_required", "There is no logbook on this listing.");
  }

  const status: SaleStatus = action === "approve" ? "live" : action === "request_changes" ? "action" : "rejected";
  const now = new Date();
  const notificationIds: string[] = [];
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<SaleListingRow>("sale_listings")
      .where({ id: listing.id })
      .whereIn("status", DECIDABLE)
      .update({
        status,
        reviewer_note: action === "approve" ? null : text,
        review_assignee: admin.adminId,
        decided_at: now,
        ...(action === "approve" ? { live_at: now } : {}),
        updated_at: now,
      })
      .returning("*");
    if (!row) notInReview();
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: action === "approve" ? "sale_listing.approved" : action === "request_changes" ? "sale_listing.changes_requested" : "sale_listing.rejected",
      entityType: "sale_listing",
      entityId: listing.id,
      before: { status: listing.status },
      after: { status, note: action === "approve" ? null : text, checklist: checklistSnapshot(merged) },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    const title = titleOf(row);
    notificationIds.push(
      await notify(trx, {
        merchantId: merchant.id,
        category: "review",
        title:
          action === "approve" ? `${title} is live` : action === "request_changes" ? `${title} needs a change` : `${title} was not approved`,
        body: action === "approve" ? `CRAL checked the logbook and photos. Buyers can now see ${row.ref}.` : text,
        ref: row.ref,
        subjectType: "sale_listing",
        subjectId: row.id,
      }),
    );
    return row;
  });
  await enqueueNotificationDelivery(merchant.id, notificationIds);
  return serializeCase(updated, merchant);
}

// ---------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------

export interface SaleReportRow {
  id: string;
  sale_listing_id: string;
  user_id: string | null;
  reason: string;
  details: string | null;
  status: "open" | "dismissed" | "actioned";
  handled_by: string | null;
  handled_at: Date | null;
  handled_note: string | null;
  created_at: Date;
  updated_at: Date;
}

async function serializeReports(rows: SaleReportRow[]) {
  const listings = rows.length
    ? await db<SaleListingRow>("sale_listings").whereIn("id", [...new Set(rows.map((r) => r.sale_listing_id))])
    : [];
  const merchants = listings.length
    ? await db<MerchantRow>("merchants").whereIn("id", [...new Set(listings.map((l) => l.merchant_id))])
    : [];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter((x): x is string => !!x))];
  const users = userIds.length ? await db<{ id: string; full_name: string | null }>("users").whereIn("id", userIds).select("id", "full_name") : [];
  const admins = await adminNames(rows.map((r) => r.handled_by));
  return rows.map((r) => {
    const l = listings.find((x) => x.id === r.sale_listing_id)!;
    const m = merchants.find((x) => x.id === l.merchant_id);
    return {
      id: r.id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      reporter_name: users.find((u) => u.id === r.user_id)?.full_name ?? null,
      handled_by_name: r.handled_by ? (admins.get(r.handled_by) ?? null) : null,
      handled_at: r.handled_at ? r.handled_at.toISOString() : null,
      handled_note: r.handled_note,
      created_at: r.created_at.toISOString(),
      listing: { id: l.id, ref: l.ref, title: titleOf(l), status: l.status, merchant_name: m ? merchantDisplayName(m) : "" },
    };
  });
}

export async function listSaleReports(query: { filter: (typeof REPORT_FILTERS)[number]; cursor?: string | undefined; limit: number }) {
  const statuses = query.filter === "open" ? ["open"] : query.filter === "handled" ? ["dismissed", "actioned"] : ["open", "dismissed", "actioned"];
  const total = Number(
    (await db("sale_listing_reports").whereIn("status", statuses).count<{ count: string }[]>("* as count"))[0]?.count ?? 0,
  );
  const rows = (await applyCursor(db<SaleReportRow>("sale_listing_reports").whereIn("status", statuses).select("*"), {
    sortColumn: "created_at",
    direction: "asc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  })) as SaleReportRow[];
  const paged = toPaginatedResult(rows, query.limit, "created_at");
  return { data: await serializeReports(paged.data), next_cursor: paged.next_cursor, has_more: paged.has_more, total };
}

export type ReportAction = "dismiss" | "pause" | "take_down";

/**
 * Dismiss leaves the listing alone. Pause sends it to `action` (the
 * merchant fixes it and resubmits for review, so they can't simply switch
 * it back on); take down sends it to `withdrawn`, final. Both close every
 * open report on the listing and tell the merchant why.
 */
export async function resolveSaleReport(reportId: string, action: ReportAction, note: string | null, admin: AdminContextInput) {
  const report = await db<SaleReportRow>("sale_listing_reports").where({ id: reportId }).first();
  if (!report) throw new ApiError({ status: 404, type: "not_found", code: "report_not_found", message: "No such report." });
  if (report.status !== "open") conflict("report_already_handled", "Someone already handled this report. Reload the queue.");
  const text = note?.trim() ?? "";
  if (action !== "dismiss" && !text) invalid("reason_required", "Write what the merchant should read.", "note");

  const listing = await db<SaleListingRow>("sale_listings").where({ id: report.sale_listing_id }).first();
  if (!listing) throw new Error(`report ${reportId} has no listing`);
  if (action !== "dismiss" && !OPEN.includes(listing.status)) {
    conflict("sale_listing_not_open", "This listing is no longer live. Dismiss the report instead.");
  }

  const now = new Date();
  const notificationIds: string[] = [];
  await db.transaction(async (trx) => {
    if (action === "dismiss") {
      const n = await trx("sale_listing_reports")
        .where({ id: report.id, status: "open" })
        .update({ status: "dismissed", handled_by: admin.adminId, handled_at: now, handled_note: text || null, updated_at: now });
      if (!n) conflict("report_already_handled", "Someone already handled this report. Reload the queue.");
      await writeAuditEntry(trx, {
        actorId: admin.adminId,
        actorType: "admin",
        action: "sale_report.dismissed",
        entityType: "sale_listing",
        entityId: listing.id,
        after: { report_id: report.id, note: text || null },
        requestId: admin.requestId,
        ip: admin.ip,
      });
      return;
    }

    const status: SaleStatus = action === "pause" ? "action" : "withdrawn";
    const [row] = await trx<SaleListingRow>("sale_listings")
      .where({ id: listing.id })
      .whereIn("status", OPEN)
      .update({ status, reviewer_note: text, decided_at: now, updated_at: now })
      .returning("*");
    if (!row) conflict("sale_listing_not_open", "This listing changed. Reload and try again.");
    const closed = await trx("sale_listing_reports")
      .where({ sale_listing_id: listing.id, status: "open" })
      .update({ status: "actioned", handled_by: admin.adminId, handled_at: now, handled_note: text, updated_at: now })
      .returning("id");
    if (!closed.some((c: { id: string }) => c.id === report.id)) {
      conflict("report_already_handled", "Someone already handled this report. Reload the queue.");
    }
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: action === "pause" ? "sale_listing.paused_by_ops" : "sale_listing.taken_down",
      entityType: "sale_listing",
      entityId: listing.id,
      before: { status: listing.status },
      after: { status, note: text, report_ids: closed.map((c: { id: string }) => c.id) },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    const title = titleOf(row);
    notificationIds.push(
      await notify(trx, {
        merchantId: listing.merchant_id,
        category: "review",
        title: action === "pause" ? `${title} is paused by CRAL` : `${title} was taken down by CRAL`,
        body: action === "pause" ? `${text} Fix the listing and send it again for review.` : text,
        ref: row.ref,
        subjectType: "sale_listing",
        subjectId: row.id,
      }),
    );
  });
  if (notificationIds.length) await enqueueNotificationDelivery(listing.merchant_id, notificationIds);
  const fresh = await db<SaleReportRow>("sale_listing_reports").where({ id: report.id }).first();
  return (await serializeReports([fresh!]))[0]!;
}

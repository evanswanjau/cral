import { ApiError, kes, type Money } from "@cral/types";
import { db } from "../../db/client.js";
import { encodeCursor, decodeCursor } from "../../lib/pagination.js";
import { merchantDisplayName, initials } from "../../lib/merchant-display.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { notify } from "../../lib/notifications.js";
import { enqueueNotificationDelivery } from "../../jobs/notification-delivery.js";
import { getMerchantApprovalDocs, merchantApprovalDocsFor } from "../../lib/platform-settings.js";
import {
  merchantChecklist,
  setMerchantCheck,
  checklistSnapshot,
  UnknownChecklistItem,
  type CheckResult,
} from "../../lib/review-checklist.js";
import { effectiveDocState } from "../vehicles/service.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import type { DocumentRow, MerchantRow, VehicleRow } from "../merchant/db-types.js";

export interface AdminCtx {
  adminId: string;
  adminName: string;
  ip: string | null;
  requestId: string | null;
}

const DOC_LABEL: Record<string, string> = {
  national_id: "Owner ID",
  kra_pin: "KRA PIN certificate",
  certificate_of_incorporation: "Certificate of Incorporation",
  company_kra_pin: "Company KRA PIN certificate",
  cr12: "CR12",
};

/**
 * The Merchants lens — "everyone who has put a vehicle in front of us"
 * (design: "Cruz Admin Vehicles.dc.html" `isMerchants` / `isMerchant`).
 * It is a directory over the same vehicle-review data PR 2 works, not a
 * second review queue: account approval is a separate slice, and the
 * design says so itself ("Approving a vehicle does not verify the
 * business - those are two separate decisions").
 */

// Statuses a vehicle can be in once it has been submitted for review.
const QUEUE_STATUSES = ["pending", "review", "action", "live", "rejected"] as const;
const OPEN_STATUSES = ["pending", "review"] as const;
const VEHICLE_DOC_KINDS = ["logbook", "comprehensive_insurance", "tracker_certificate"] as const;

const STATUS_TO_BUCKET: Record<string, string> = {
  pending: "needs_review",
  review: "with_you",
  action: "changes_sent",
  live: "approved",
  rejected: "rejected",
};

interface MerchantAggregate {
  merchant: MerchantRow;
  phone: string | null;
  fleet: number;
  live: number;
  waiting: number;
  rejected: number;
  towns: string[];
}

/** Loads every merchant that has at least one submitted vehicle, with its tallies. */
async function loadAggregates(): Promise<MerchantAggregate[]> {
  const vehicles = await db<VehicleRow>("vehicles").whereIn("status", [...QUEUE_STATUSES]);
  if (vehicles.length === 0) return [];

  const merchantIds = [...new Set(vehicles.map((v) => v.merchant_id))];
  const merchants = await db<MerchantRow>("merchants").whereIn("id", merchantIds);
  const users = await db<{ id: string; phone: string | null }>("users").whereIn(
    "id",
    merchants.map((m) => m.user_id),
  );
  const phoneByUser = new Map(users.map((u) => [u.id, u.phone]));
  const byMerchant = new Map<string, VehicleRow[]>();
  for (const v of vehicles) {
    const list = byMerchant.get(v.merchant_id) ?? [];
    list.push(v);
    byMerchant.set(v.merchant_id, list);
  }

  return merchants.map((merchant) => {
    const fleet = byMerchant.get(merchant.id) ?? [];
    return {
      merchant,
      phone: phoneByUser.get(merchant.user_id) ?? null,
      fleet: fleet.length,
      live: fleet.filter((v) => v.status === "live").length,
      waiting: fleet.filter((v) => (OPEN_STATUSES as readonly string[]).includes(v.status)).length,
      rejected: fleet.filter((v) => v.status === "rejected").length,
      towns: [...new Set(fleet.map((v) => v.county).filter((c): c is string => !!c))],
    };
  });
}

function contactLine(a: MerchantAggregate): string {
  const person =
    a.merchant.owner_type === "company"
      ? [a.merchant.first_name, a.merchant.surname].filter(Boolean).join(" ")
      : merchantDisplayName(a.merchant);
  return [person || null, a.phone].filter(Boolean).join(" · ") || "No contact on file";
}

// ---------------------------------------------------------------------
// List
// ---------------------------------------------------------------------

export interface ListMerchantsQuery {
  cursor?: string;
  limit: number;
}

/**
 * Sorted most-waiting-first, tie-broken by merchant id (stable). Paged by
 * a keyset cursor of `(waiting, id)` rather than an offset. The full set
 * is "merchants who have ever submitted a vehicle" - bounded and small -
 * so it is loaded and sorted in the service, the same shape as the
 * design's own client.
 */
export async function listMerchants(query: ListMerchantsQuery) {
  const aggregates = await loadAggregates();
  aggregates.sort((a, b) => b.waiting - a.waiting || (a.merchant.id < b.merchant.id ? 1 : -1));

  let start = 0;
  if (query.cursor) {
    const decoded = decodeCursor(query.cursor);
    if (decoded && typeof decoded.v === "number") {
      const w = decoded.v;
      const afterId = decoded.id;
      const idx = aggregates.findIndex(
        (a) => a.waiting < w || (a.waiting === w && a.merchant.id < afterId),
      );
      start = idx === -1 ? aggregates.length : idx;
    }
  }

  const slice = aggregates.slice(start, start + query.limit + 1);
  const hasMore = slice.length > query.limit;
  const page = hasMore ? slice.slice(0, query.limit) : slice;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ v: last.waiting, id: last.merchant.id }) : null;

  return {
    data: page.map((a) => {
      const name = merchantDisplayName(a.merchant);
      return {
        id: a.merchant.id,
        name,
        initials: initials(name),
        approved: a.merchant.approved_at !== null,
        badge: a.merchant.approved_at !== null ? "verified" : "new_merchant",
        contact: contactLine(a),
        joined: a.merchant.created_at.toISOString(),
        towns: a.towns,
        fleet: a.fleet,
        live: a.live,
        waiting: a.waiting,
      };
    }),
    next_cursor: nextCursor,
    has_more: hasMore,
    total: aggregates.length,
  };
}

// ---------------------------------------------------------------------
// File
// ---------------------------------------------------------------------

function moneyOrNull(v: VehicleRow): Money | null {
  return v.daily_rate_amount ? kes(v.daily_rate_amount) : null;
}

async function requireMerchant(merchantId: string): Promise<MerchantRow> {
  const merchant = await db<MerchantRow>("merchants").where({ id: merchantId }).first();
  if (!merchant) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "merchant_not_found",
      message: "No merchant with that id.",
    });
  }
  return merchant;
}

export async function getMerchantFile(merchantId: string) {
  const merchant = await requireMerchant(merchantId);

  const [user, vehicles, ownerDocs, checklist, docSets] = await Promise.all([
    db<{ id: string; phone: string | null }>("users").where({ id: merchant.user_id }).first(),
    db<VehicleRow>("vehicles").where({ merchant_id: merchant.id }).whereIn("status", [...QUEUE_STATUSES]),
    db<DocumentRow>("documents").where({ merchant_id: merchant.id, vehicle_id: null }),
    merchantChecklist(merchant),
    getMerchantApprovalDocs(),
  ]);

  // The business / account documents - this file's own review gate.
  const requiredDocs = merchantApprovalDocsFor(merchant.owner_type, docSets);
  const businessDocuments = requiredDocs.map((kind) => {
    const doc = ownerDocs.find((d) => d.kind === kind);
    return {
      kind,
      label: DOC_LABEL[kind] ?? kind,
      state: effectiveDocState(doc),
      document_id: doc?.id ?? null,
      review_note: doc?.review_note ?? null,
      original_name: doc?.original_name ?? null,
    };
  });
  const docsOutstanding = businessDocuments.filter((d) => d.state !== "ok").map((d) => d.kind);
  const canApprove =
    docsOutstanding.length === 0 && checklist.block.blockers_outstanding === 0;
  const vehicleIds = vehicles.map((v) => v.id);
  const docs = vehicleIds.length
    ? await db<DocumentRow>("documents").whereIn("vehicle_id", vehicleIds)
    : [];
  const docsByVehicle = new Map<string, DocumentRow[]>();
  for (const d of docs) {
    if (!d.vehicle_id) continue;
    const list = docsByVehicle.get(d.vehicle_id) ?? [];
    list.push(d);
    docsByVehicle.set(d.vehicle_id, list);
  }

  const agg = {
    fleet: vehicles.length,
    live: vehicles.filter((v) => v.status === "live").length,
    waiting: vehicles.filter((v) => (OPEN_STATUSES as readonly string[]).includes(v.status)).length,
    rejected: vehicles.filter((v) => v.status === "rejected").length,
  };
  const name = merchantDisplayName(merchant);
  const towns = [...new Set(vehicles.map((v) => v.county).filter((c): c is string => !!c))];

  // Oldest still-open case — the "Review <plate>" button jumps to it.
  const nextCase = vehicles
    .filter((v) => (OPEN_STATUSES as readonly string[]).includes(v.status))
    .sort((a, b) => (a.submitted_at ?? a.created_at).getTime() - (b.submitted_at ?? b.created_at).getTime())[0];

  const approved = merchant.approved_at !== null;
  const note = !approved
    ? "Business documents for this merchant are still being checked. Approving a vehicle does not verify the business - those are two separate decisions."
    : agg.rejected > 0
      ? `${agg.rejected} earlier submission${agg.rejected === 1 ? " was" : "s were"} rejected. Read what they were told before you decide again.`
      : null;

  return {
    id: merchant.id,
    name,
    initials: initials(name),
    approved,
    badge: approved ? "verified" : "new_merchant",
    owner_type: merchant.owner_type,
    contact: [
      merchant.owner_type === "company"
        ? [merchant.first_name, merchant.surname].filter(Boolean).join(" ")
        : name,
      user?.phone ?? null,
    ]
      .filter(Boolean)
      .join(" · ") || "No contact on file",
    joined: merchant.created_at.toISOString(),
    towns,
    note,
    can_approve: canApprove,
    approve_blockers: { documents: docsOutstanding.length, checklist: checklist.block.blockers_outstanding },
    outstanding_documents: docsOutstanding,
    business_documents: businessDocuments,
    checklist: checklist.block,
    stats: {
      submitted: agg.fleet,
      live: agg.live,
      waiting: agg.waiting,
      rejected: agg.rejected,
    },
    review_next: nextCase ? { id: nextCase.id, registration: nextCase.registration } : null,
    fleet: vehicles
      .slice()
      .sort((a, b) => (b.submitted_at ?? b.created_at).getTime() - (a.submitted_at ?? a.created_at).getTime())
      .map((v) => {
        const vd = docsByVehicle.get(v.id) ?? [];
        let accepted = 0;
        let hasIssue = false;
        for (const kind of VEHICLE_DOC_KINDS) {
          const state = effectiveDocState(vd.find((d) => d.kind === kind));
          if (state === "ok") accepted++;
          else if (state === "missing" || state === "rejected") hasIssue = true;
        }
        return {
          id: v.id,
          registration: v.registration,
          title: [v.make, v.model].filter(Boolean).join(" "),
          spec: `${v.type} · ${v.year} · ${v.county ?? "—"}`,
          status: v.status,
          bucket: STATUS_TO_BUCKET[v.status],
          docs_accepted: accepted,
          docs_total: VEHICLE_DOC_KINDS.length,
          docs_has_issue: hasIssue,
          daily_rate: moneyOrNull(v),
          submitted_at: (v.submitted_at ?? v.created_at).toISOString(),
        };
      }),
    fleet_summary:
      agg.waiting > 0
        ? `${agg.waiting} of ${agg.fleet} vehicles are waiting on a decision from us.`
        : "Nothing from this merchant is waiting on us.",
  };
}

// ---------------------------------------------------------------------
// Business-document decision
// ---------------------------------------------------------------------

export async function decideMerchantDocument(
  merchantId: string,
  kind: string,
  decision: "accept" | "reject",
  note: string | null,
  admin: AdminCtx,
) {
  const merchant = await requireMerchant(merchantId);
  const allowed = merchantApprovalDocsFor(merchant.owner_type, await getMerchantApprovalDocs());
  if (!allowed.includes(kind)) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "not_a_reviewable_document",
      message: `"${kind}" is not a business document for this merchant.`,
      field: "kind",
    });
  }
  if (decision === "reject" && !note?.trim()) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "reason_required",
      message: "Write what the merchant should read before rejecting a document.",
      field: "note",
    });
  }

  const doc = await db<DocumentRow>("documents")
    .where({ merchant_id: merchant.id, vehicle_id: null, kind: kind as DocumentRow["kind"] })
    .first();
  if (!doc) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "document_not_uploaded",
      message: "Nothing is uploaded on that line yet.",
    });
  }

  const nextState = decision === "accept" ? "ok" : "rejected";
  const notificationIds: string[] = [];
  await db.transaction(async (trx) => {
    await trx<DocumentRow>("documents")
      .where({ id: doc.id })
      .update({
        review_state: nextState,
        review_note: decision === "reject" ? note!.trim() : null,
        reviewed_by: admin.adminId,
        reviewed_at: new Date(),
      });
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: decision === "accept" ? "merchant.document_accepted" : "merchant.document_rejected",
      entityType: "document",
      entityId: doc.id,
      before: { review_state: doc.review_state },
      after: { review_state: nextState, kind },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    if (decision === "reject") {
      notificationIds.push(
        await notify(trx, {
          merchantId: merchant.id,
          category: "review",
          title: `${DOC_LABEL[kind] ?? kind} needs another look`,
          body: note!.trim(),
          subjectType: null,
          subjectId: null,
        }),
      );
    }
  });
  if (notificationIds.length) await enqueueNotificationDelivery(merchant.id, notificationIds);
  return getMerchantFile(merchantId);
}

// ---------------------------------------------------------------------
// Merchant checklist
// ---------------------------------------------------------------------

export async function setMerchantChecklistItem(
  merchantId: string,
  itemId: string,
  result: CheckResult,
  note: string | null,
  admin: AdminCtx,
) {
  const merchant = await requireMerchant(merchantId);
  try {
    await setMerchantCheck(merchant, itemId, result, note?.trim() || null, admin.adminId);
  } catch (err) {
    if (err instanceof UnknownChecklistItem) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "unknown_checklist_item",
        message: `"${itemId}" is not on this checklist.`,
        field: "item_id",
      });
    }
    throw err;
  }
  return getMerchantFile(merchantId);
}

// ---------------------------------------------------------------------
// Approve / reopen
// ---------------------------------------------------------------------

export async function approveMerchant(merchantId: string, admin: AdminCtx) {
  const merchant = await requireMerchant(merchantId);
  if (merchant.approved_at !== null) return getMerchantFile(merchantId);

  const [ownerDocs, checklist, docSets] = await Promise.all([
    db<DocumentRow>("documents").where({ merchant_id: merchant.id, vehicle_id: null }),
    merchantChecklist(merchant),
    getMerchantApprovalDocs(),
  ]);
  const required = merchantApprovalDocsFor(merchant.owner_type, docSets);
  const docsOutstanding = required.filter(
    (kind) => effectiveDocState(ownerDocs.find((d) => d.kind === kind)) !== "ok",
  );
  if (docsOutstanding.length) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "documents_not_all_accepted",
      message: `Accept every business document first — still outstanding: ${docsOutstanding.join(", ")}.`,
    });
  }
  const blocking = checklist.merged.filter((m) => m.severity === "block" && m.result !== "pass");
  if (blocking.length) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "checklist_blockers_outstanding",
      message: `Work the checklist first — still open: ${blocking.map((b) => b.label).join("; ")}.`,
    });
  }

  const notificationIds: string[] = [];
  await db.transaction(async (trx) => {
    await trx("merchants").where({ id: merchant.id }).update({ approved_at: new Date() });
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: "merchant.approved",
      entityType: "merchant",
      entityId: merchant.id,
      after: { checklist: checklistSnapshot(checklist.merged) },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    notificationIds.push(
      await notify(trx, {
        merchantId: merchant.id,
        category: "review",
        title: "Your business is verified",
        body: "Your account documents have been approved. New vehicles now only need their own documents checked.",
        subjectType: null,
        subjectId: null,
      }),
    );
  });
  await enqueueNotificationDelivery(merchant.id, notificationIds);
  return getMerchantFile(merchantId);
}

export async function reopenMerchantReview(merchantId: string, admin: AdminCtx) {
  const merchant = await requireMerchant(merchantId);
  if (merchant.approved_at === null) return getMerchantFile(merchantId);

  await db.transaction(async (trx) => {
    await trx("merchants").where({ id: merchant.id }).update({ approved_at: null });
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: "merchant.approval_reopened",
      entityType: "merchant",
      entityId: merchant.id,
      before: { approved_at: merchant.approved_at?.toISOString() ?? null },
      requestId: admin.requestId,
      ip: admin.ip,
    });
  });
  return getMerchantFile(merchantId);
}

// ---------------------------------------------------------------------
// Business-document bytes
// ---------------------------------------------------------------------

let _storage: ReturnType<typeof createStorageAdapter> | null = null;
function storage() {
  _storage ??= createStorageAdapter();
  return _storage;
}

export async function readBusinessDocument(merchantId: string, documentId: string) {
  const doc = await db<DocumentRow>("documents")
    .where({ id: documentId, merchant_id: merchantId, vehicle_id: null })
    .first();
  if (!doc) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "document_not_found",
      message: "That document doesn't exist on this merchant.",
    });
  }
  const body = await storage()
    .getObject(doc.storage_key)
    .catch(() => {
      throw new ApiError({
        status: 404,
        type: "not_found",
        code: "document_bytes_missing",
        message: "That file is no longer stored.",
      });
    });
  return { body, contentType: doc.content_type, originalName: doc.original_name };
}

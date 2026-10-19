import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { notify } from "../../lib/notifications.js";
import { enqueueNotificationDelivery } from "../../jobs/notification-delivery.js";
import { merchantDisplayName } from "../../lib/merchant-display.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import { effectiveDocState } from "../vehicles/service.js";
import {
  DOC_LABELS,
  driverDocuments,
  driverRates,
  isLicenceExpired,
  licenceExpiryKey,
} from "../drivers/service.js";
import { DRIVER_DOCUMENT_KINDS, type DriverDocumentKind } from "../drivers/schemas.js";
import type { DocumentRow, DriverRow, DriverStatus, MerchantRow } from "../merchant/db-types.js";
import type { AdminContextInput } from "../admin-vehicles/service.js";

/**
 * Ops review of drivers (owner's call, 2026-10-18 - docs/plans/drivers.md,
 * openapi/admin-drivers.yaml). Deliberately lighter than the vehicle case
 * (no checklist): three documents to accept or reject, then one decision.
 *
 * Gate order, same shape as a vehicle: the merchant account approved ->
 * the driver approved -> bookable. The account holder's ID and KRA PIN are
 * the account's documents and are decided on the merchant file, not here.
 */

let storageAdapter: ReturnType<typeof createStorageAdapter> | null = null;
function storage(): ReturnType<typeof createStorageAdapter> {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

const FILTER_STATUSES: Record<string, DriverStatus[]> = {
  all: ["pending", "review", "action", "rejected", "live", "paused"],
  open: ["pending", "review"],
  changes_sent: ["action"],
  approved: ["live", "paused"],
  rejected: ["rejected"],
};
export const DRIVER_QUEUE_FILTERS = Object.keys(FILTER_STATUSES);

async function requireCase(driverId: string): Promise<{ driver: DriverRow; merchant: MerchantRow }> {
  const driver = await db<DriverRow>("drivers").where({ id: driverId }).first();
  if (!driver || driver.status === "draft") {
    throw new ApiError({ status: 404, type: "not_found", code: "review_case_not_found", message: "No review case for that driver." });
  }
  const merchant = await db<MerchantRow>("merchants").where({ id: driver.merchant_id }).first();
  if (!merchant) throw new Error(`driver ${driverId} has no merchant row`);
  return { driver, merchant };
}

// ---------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------

export async function listDriverQueue(query: { filter: string; cursor?: string | undefined; limit: number }) {
  const statuses = FILTER_STATUSES[query.filter] ?? FILTER_STATUSES.all!;
  const total = Number(
    ((await db("drivers").whereIn("status", statuses).count<{ count: string }[]>("* as count"))[0]?.count) ?? 0,
  );
  const rows = (await applyCursor(db<DriverRow>("drivers").whereIn("status", statuses).select("*"), {
    sortColumn: "submitted_at",
    direction: "asc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  })) as DriverRow[];
  const paged = toPaginatedResult(rows, query.limit, "submitted_at");
  const merchants = await db<MerchantRow>("merchants").whereIn(
    "id",
    [...new Set(paged.data.map((d) => d.merchant_id))],
  );
  const docs = await driverDocuments(paged.data);

  return {
    data: paged.data.map((d) => {
      const m = merchants.find((x) => x.id === d.merchant_id);
      const slots = docs.get(d.id)!;
      return {
        id: d.id,
        full_name: d.full_name,
        county: d.county,
        status: d.status,
        merchant_id: d.merchant_id,
        merchant_name: m ? merchantDisplayName(m) : "",
        merchant_approved: Boolean(m?.approved_at),
        docs_accepted: DRIVER_DOCUMENT_KINDS.filter((k) => effectiveDocState(slots[k]) === "ok").length,
        licence_expired: isLicenceExpired(d),
        submitted_at: d.submitted_at ? d.submitted_at.toISOString() : null,
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

async function serializeCase(driver: DriverRow, merchant: MerchantRow) {
  const slots = (await driverDocuments([driver])).get(driver.id)!;
  return {
    id: driver.id,
    full_name: driver.full_name,
    phone: driver.phone,
    national_id: driver.national_id,
    kra_pin: driver.kra_pin,
    licence_number: driver.licence_number,
    licence_expiry: licenceExpiryKey(driver),
    licence_expired: isLicenceExpired(driver),
    county: driver.county,
    is_account_holder: driver.is_account_holder,
    rates: driverRates(driver),
    status: driver.status,
    reviewer_note: driver.reviewer_note,
    submitted_at: driver.submitted_at ? driver.submitted_at.toISOString() : null,
    merchant: {
      id: merchant.id,
      name: merchantDisplayName(merchant),
      owner_type: merchant.owner_type,
      approved: merchant.approved_at !== null,
    },
    documents: DRIVER_DOCUMENT_KINDS.map((kind) => {
      const doc = slots[kind];
      return {
        kind,
        label: DOC_LABELS[kind],
        document_id: doc?.id ?? null,
        original_name: doc?.original_name ?? null,
        state: effectiveDocState(doc),
        review_note: doc?.review_note ?? null,
        expires_at: doc?.expires_at ?? null,
        from_account: doc?.from_account ?? (driver.is_account_holder && kind !== "driving_licence"),
      };
    }),
  };
}

export async function getDriverCase(driverId: string) {
  const { driver, merchant } = await requireCase(driverId);
  return serializeCase(driver, merchant);
}

// ---------------------------------------------------------------------
// Document decision
// ---------------------------------------------------------------------

export async function decideDriverDocument(
  driverId: string,
  kind: string,
  decision: "accept" | "reject",
  note: string | null,
  admin: AdminContextInput,
) {
  if (!(DRIVER_DOCUMENT_KINDS as readonly string[]).includes(kind)) {
    throw new ApiError({ status: 422, type: "validation_error", code: "not_a_reviewable_document", message: `"${kind}" is not a driver document.`, field: "kind" });
  }
  if (decision === "reject" && !note?.trim()) {
    throw new ApiError({ status: 422, type: "validation_error", code: "reason_required", message: "Write what the merchant should read before rejecting a document.", field: "note" });
  }
  const { driver, merchant } = await requireCase(driverId);
  const slot = (await driverDocuments([driver])).get(driver.id)![kind as DriverDocumentKind];
  if (!slot) {
    throw new ApiError({ status: 404, type: "not_found", code: "document_not_uploaded", message: "Nothing is uploaded on that line yet." });
  }
  if (slot.from_account) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "account_document",
      message: "This is the account's own document - decide it on the merchant file.",
    });
  }

  const nextState = decision === "accept" ? "ok" : "rejected";
  const notificationIds: string[] = [];
  await db.transaction(async (trx) => {
    await trx<DocumentRow>("documents").where({ id: slot.id }).update({
      review_state: nextState,
      review_note: decision === "reject" ? note!.trim() : null,
      reviewed_by: admin.adminId,
      reviewed_at: new Date(),
    });
    // Working a case claims it, same as the vehicle queue.
    if (driver.status === "pending" || !driver.review_assignee) {
      await trx<DriverRow>("drivers")
        .where({ id: driver.id })
        .update({ review_assignee: driver.review_assignee ?? admin.adminId, status: driver.status === "pending" ? "review" : driver.status });
    }
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: decision === "accept" ? "admin.document_accepted" : "admin.document_rejected",
      entityType: "document",
      entityId: slot.id,
      before: { review_state: slot.review_state },
      after: { review_state: nextState, kind, driver_id: driver.id },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    if (decision === "reject") {
      notificationIds.push(
        await notify(trx, {
          merchantId: merchant.id,
          category: "review",
          title: `${DOC_LABELS[kind as DriverDocumentKind]} for ${driver.full_name} needs another look`,
          body: note!.trim(),
          ref: driver.full_name,
          subjectType: "driver",
          subjectId: driver.id,
        }),
      );
    }
  });
  if (notificationIds.length) await enqueueNotificationDelivery(merchant.id, notificationIds);
  return getDriverCase(driverId);
}

// ---------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------

export type DriverAction = "approve" | "request_changes" | "reject";

export async function decideDriver(driverId: string, action: DriverAction, note: string | null, admin: AdminContextInput) {
  const { driver, merchant } = await requireCase(driverId);
  if ((action === "request_changes" || action === "reject") && !note?.trim()) {
    throw new ApiError({ status: 422, type: "validation_error", code: "reason_required", message: "Write what the merchant should read.", field: "note" });
  }

  if (action === "approve") {
    if (merchant.approved_at === null) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "merchant_not_approved",
        message: "Approve the merchant's account on the merchant file before approving one of its drivers.",
      });
    }
    if (isLicenceExpired(driver)) {
      throw new ApiError({ status: 422, type: "validation_error", code: "licence_expired", message: "This driver's licence has expired." });
    }
    const slots = (await driverDocuments([driver])).get(driver.id)!;
    const outstanding = DRIVER_DOCUMENT_KINDS.filter((k) => effectiveDocState(slots[k]) !== "ok");
    if (outstanding.length) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "documents_not_all_accepted",
        message: `Accept every document first - still outstanding: ${outstanding.map((k) => DOC_LABELS[k]).join(", ")}.`,
      });
    }
  }

  const status: DriverStatus = action === "approve" ? "live" : action === "request_changes" ? "action" : "rejected";
  const notificationIds: string[] = [];
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<DriverRow>("drivers")
      .where({ id: driver.id })
      .update({
        status,
        reviewer_note: action === "approve" ? null : note!.trim(),
        review_assignee: admin.adminId,
        decided_at: new Date(),
      })
      .returning("*");
    if (!row) throw new Error("decision failed");
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: action === "approve" ? "driver.approved" : action === "request_changes" ? "driver.changes_requested" : "driver.rejected",
      entityType: "driver",
      entityId: driver.id,
      before: { status: driver.status },
      after: { status, note: action === "approve" ? null : note!.trim() },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    notificationIds.push(
      await notify(trx, {
        merchantId: merchant.id,
        category: "review",
        title:
          action === "approve"
            ? `${row.full_name} can take bookings`
            : action === "request_changes"
              ? `${row.full_name} needs a change before they can take bookings`
              : `${row.full_name} was not approved`,
        body: action === "approve" ? `Approved as a driver in ${row.county}.` : note!.trim(),
        ref: row.full_name,
        subjectType: "driver",
        subjectId: row.id,
      }),
    );
    return row;
  });
  await enqueueNotificationDelivery(merchant.id, notificationIds);
  return serializeCase(updated, merchant);
}

// ---------------------------------------------------------------------
// Document bytes
// ---------------------------------------------------------------------

export async function readDriverDocument(driverId: string, documentId: string) {
  const { driver } = await requireCase(driverId);
  const slots = (await driverDocuments([driver])).get(driver.id)!;
  const doc = Object.values(slots).find((s) => s?.id === documentId);
  if (!doc) {
    throw new ApiError({ status: 404, type: "not_found", code: "document_not_found", message: "That document isn't on this driver." });
  }
  const body = await storage()
    .getObject(doc.storage_key)
    .catch(() => {
      throw new ApiError({ status: 404, type: "not_found", code: "document_bytes_missing", message: "That file is no longer stored." });
    });
  return { body, contentType: doc.content_type, originalName: doc.original_name };
}

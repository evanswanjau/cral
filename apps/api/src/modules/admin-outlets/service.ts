import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { notify } from "../../lib/notifications.js";
import { enqueueNotificationDelivery } from "../../jobs/notification-delivery.js";
import { merchantDisplayName } from "../../lib/merchant-display.js";
import { nairobiDayKey } from "../../lib/dates.js";
import {
  checklistSnapshot,
  flaggedItems,
  getOutletChecklistDefinition,
  loadRows,
  mergeChecklist,
  outletApplies,
  toBlock,
  unanswered,
  upsertCheck,
  type CheckResult,
  type ChecklistDocContext,
  type MergedCheck,
} from "../../lib/review-checklist.js";
import { outletPhotos, readOutletPhoto, visitDateKey, type OutletPhotoRow, type OutletRow } from "../outlets/service.js";
import { MIN_OUTLET_PHOTOS, type OutletStatus } from "../outlets/schemas.js";
import type { MerchantRow } from "../merchant/db-types.js";
import type { AdminContextInput } from "../admin-vehicles/service.js";

/**
 * Ops review of outlets (Phase 4 GS1 - docs/decisions/garage.md,
 * openapi/admin-outlets.yaml). Checklist-first like the vehicle case, on
 * the shared `lib/review-checklist.ts` engine; the checklist is mostly
 * the visit.
 *
 * The `visit_done` item is the record behind "Garages are visited":
 * passing it needs a date and who went, both stored on the outlet with
 * the reviewer who recorded them. Any other answer clears them, so a
 * visit can never be shown without a pass behind it.
 */

export const VISIT_ITEM = "visit_done";
const DECIDABLE: OutletStatus[] = ["pending", "review"];

const FILTER_STATUSES: Record<string, OutletStatus[]> = {
  all: ["pending", "review", "action", "rejected", "live", "paused"],
  open: ["pending", "review"],
  changes_sent: ["action"],
  approved: ["live", "paused"],
  rejected: ["rejected"],
};
export const OUTLET_QUEUE_FILTERS = Object.keys(FILTER_STATUSES);

function invalid(code: string, message: string, field?: string): never {
  throw new ApiError({ status: 422, type: "validation_error", code, message, ...(field ? { field } : {}) });
}

function notInReview(): never {
  throw new ApiError({
    status: 409,
    type: "conflict",
    code: "outlet_not_in_review",
    message: "These premises aren't waiting for a decision any more. Reload the case.",
  });
}

async function requireCase(outletId: string): Promise<{ outlet: OutletRow; merchant: MerchantRow }> {
  const outlet = await db<OutletRow>("outlets").where({ id: outletId }).first();
  if (!outlet || outlet.status === "draft") {
    throw new ApiError({ status: 404, type: "not_found", code: "review_case_not_found", message: "No review case for those premises." });
  }
  const merchant = await db<MerchantRow>("merchants").where({ id: outlet.merchant_id }).first();
  if (!merchant) throw new Error(`outlet ${outletId} has no merchant row`);
  return { outlet, merchant };
}

// ---------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------

/** Premises answers go stale when the name/address/county change; photo answers when a photo is added. */
function contextFor(outlet: OutletRow, photos: OutletPhotoRow[]): ChecklistDocContext {
  const uploadedAt = new Map<string, Date>([["premises", outlet.details_updated_at]]);
  const newest = photos.reduce<Date | null>((m, p) => (!m || p.created_at > m ? p.created_at : m), null);
  if (newest) uploadedAt.set("photos", newest);
  return { uploadedAt, rejected: new Set() };
}

export async function outletChecklist(outlet: OutletRow, photos: OutletPhotoRow[]) {
  const [def, rows] = await Promise.all([
    getOutletChecklistDefinition(),
    loadRows("outlet_review_checks", "outlet_id", outlet.id),
  ]);
  const merged = mergeChecklist(
    def.filter((it) => outletApplies(it, outlet)),
    rows,
    contextFor(outlet, photos),
  );
  return { merged, block: toBlock(merged) };
}

/** A visit is shown only while its checklist pass is current. */
function visitOf(outlet: OutletRow, merged: MergedCheck[], recorderName: string | null) {
  const pass = merged.find((m) => m.id === VISIT_ITEM)?.result === "pass";
  if (!pass || !outlet.visited_on || !outlet.visited_by) return null;
  return { visited_on: visitDateKey(outlet.visited_on), visited_by: outlet.visited_by, recorded_by_name: recorderName };
}

// ---------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------

export async function listOutletQueue(query: { filter: string; cursor?: string | undefined; limit: number }) {
  const statuses = FILTER_STATUSES[query.filter] ?? FILTER_STATUSES.all!;
  const total = Number(
    (await db("outlets").whereIn("status", statuses).count<{ count: string }[]>("* as count"))[0]?.count ?? 0,
  );
  const rows = (await applyCursor(db<OutletRow>("outlets").whereIn("status", statuses).select("*"), {
    sortColumn: "submitted_at",
    direction: "asc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  })) as OutletRow[];
  const paged = toPaginatedResult(rows, query.limit, "submitted_at");
  const merchants = await db<MerchantRow>("merchants").whereIn("id", [...new Set(paged.data.map((o) => o.merchant_id))]);
  const assigneeIds = [...new Set(paged.data.map((o) => o.review_assignee).filter((x): x is string => !!x))];
  const admins = assigneeIds.length
    ? (await db<{ id: string; full_name: string }>("admin_users").whereIn("id", assigneeIds).select("id", "full_name")).map((a) => ({ id: a.id, name: a.full_name }))
    : [];
  const photos = await outletPhotos(paged.data.map((o) => o.id));

  return {
    data: paged.data.map((o) => {
      const m = merchants.find((x) => x.id === o.merchant_id);
      return {
        id: o.id,
        kind: o.kind,
        name: o.name,
        county: o.county,
        status: o.status,
        merchant_id: o.merchant_id,
        merchant_name: m ? merchantDisplayName(m) : "",
        merchant_approved: Boolean(m?.approved_at),
        assignee_name: admins.find((a) => a.id === o.review_assignee)?.name ?? null,
        visited: o.visited_on !== null,
        photo_count: photos.get(o.id)?.length ?? 0,
        submitted_at: o.submitted_at ? o.submitted_at.toISOString() : null,
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

async function serializeCase(outlet: OutletRow, merchant: MerchantRow) {
  const photos = (await outletPhotos([outlet.id])).get(outlet.id) ?? [];
  const { merged, block } = await outletChecklist(outlet, photos);
  const adminIds = [outlet.review_assignee, outlet.visit_recorded_by].filter((x): x is string => !!x);
  const admins = adminIds.length
    ? (await db<{ id: string; full_name: string }>("admin_users").whereIn("id", adminIds).select("id", "full_name")).map((a) => ({ id: a.id, name: a.full_name }))
    : [];
  const nameOf = (id: string | null) => (id ? (admins.find((a) => a.id === id)?.name ?? null) : null);
  return {
    id: outlet.id,
    kind: outlet.kind,
    name: outlet.name,
    address: outlet.address,
    county: outlet.county,
    phone: outlet.phone,
    opening_hours: outlet.opening_hours,
    service_types: outlet.service_types ?? [],
    status: outlet.status,
    reviewer_note: outlet.reviewer_note,
    submitted_at: outlet.submitted_at ? outlet.submitted_at.toISOString() : null,
    assignee: outlet.review_assignee ? { id: outlet.review_assignee, name: nameOf(outlet.review_assignee) ?? "" } : null,
    visit: visitOf(outlet, merged, nameOf(outlet.visit_recorded_by)),
    photos: photos.map((p) => ({ id: p.id, original_name: p.original_name, created_at: p.created_at.toISOString() })),
    merchant: {
      id: merchant.id,
      name: merchantDisplayName(merchant),
      owner_type: merchant.owner_type,
      approved: merchant.approved_at !== null,
    },
    checklist: block,
  };
}

export async function getOutletCase(outletId: string) {
  const { outlet, merchant } = await requireCase(outletId);
  return serializeCase(outlet, merchant);
}

/** `force` (the explicit "Assign to me") takes the case from anyone; working a case claims only an unassigned or pending one. */
async function claim(outlet: OutletRow, admin: AdminContextInput, force: boolean): Promise<OutletRow> {
  if (!DECIDABLE.includes(outlet.status)) return outlet;
  if (!force && outlet.status !== "pending" && outlet.review_assignee !== null) return outlet;
  const assignee = force ? admin.adminId : (outlet.review_assignee ?? admin.adminId);
  if (assignee === outlet.review_assignee && outlet.status === "review") return outlet;
  return db.transaction(async (trx) => {
    const [row] = await trx<OutletRow>("outlets")
      .where({ id: outlet.id, status: outlet.status })
      .update({ review_assignee: assignee, status: "review" })
      .returning("*");
    if (!row) notInReview();
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: "outlet.assigned",
      entityType: "outlet",
      entityId: outlet.id,
      before: { status: outlet.status, review_assignee: outlet.review_assignee },
      after: { status: "review", review_assignee: assignee },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    return row;
  });
}

export async function assignOutlet(outletId: string, admin: AdminContextInput) {
  const { outlet, merchant } = await requireCase(outletId);
  if (!DECIDABLE.includes(outlet.status)) notInReview();
  return serializeCase(await claim(outlet, admin, true), merchant);
}

export async function readCasePhoto(outletId: string, photoId: string) {
  await requireCase(outletId);
  return readOutletPhoto(outletId, photoId);
}

// ---------------------------------------------------------------------
// One checklist answer
// ---------------------------------------------------------------------

export interface ChecklistAnswerInput {
  item_id: string;
  result: CheckResult;
  note?: string | null | undefined;
  visited_on?: string | undefined;
  visited_by?: string | undefined;
}

export async function setOutletCheck(outletId: string, input: ChecklistAnswerInput, admin: AdminContextInput) {
  const { outlet: found, merchant } = await requireCase(outletId);
  if (!DECIDABLE.includes(found.status)) notInReview();
  const def = (await getOutletChecklistDefinition()).filter((it) => outletApplies(it, found));
  if (!def.some((it) => it.id === input.item_id)) {
    invalid("unknown_checklist_item", `No checklist item "${input.item_id}".`, "item_id");
  }

  const isVisit = input.item_id === VISIT_ITEM;
  let visit: { visited_on: string; visited_by: string } | null = null;
  if (isVisit && input.result === "pass") {
    const by = input.visited_by?.trim();
    if (!input.visited_on || !by) {
      invalid("visit_details_required", "Record the date of the visit and who went.", input.visited_on ? "visited_by" : "visited_on");
    }
    if (input.visited_on > nairobiDayKey(new Date())) {
      invalid("visit_in_future", "The visit date can't be in the future.", "visited_on");
    }
    visit = { visited_on: input.visited_on, visited_by: by };
  }

  const outlet = await claim(found, admin, false);
  const note = input.note?.trim() || null;
  await db.transaction(async (trx) => {
    await upsertCheck("outlet_review_checks", { outlet_id: outlet.id }, input.item_id, input.result, note, admin.adminId, trx);
    if (isVisit) {
      await trx<OutletRow>("outlets")
        .where({ id: outlet.id })
        .update(
          visit
            ? { visited_on: visit.visited_on, visited_by: visit.visited_by, visit_recorded_by: admin.adminId }
            : { visited_on: null, visited_by: null, visit_recorded_by: null },
        );
    }
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: isVisit ? (visit ? "outlet.visit_recorded" : "outlet.visit_cleared") : "outlet.check_answered",
      entityType: "outlet",
      entityId: outlet.id,
      after: { item_id: input.item_id, result: input.result, note, ...(visit ?? {}) },
      requestId: admin.requestId,
      ip: admin.ip,
    });
  });
  const fresh = await db<OutletRow>("outlets").where({ id: outlet.id }).first();
  return serializeCase(fresh!, merchant);
}

// ---------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------

export type OutletAction = "approve" | "request_changes" | "reject";

export async function decideOutlet(outletId: string, action: OutletAction, note: string | null, admin: AdminContextInput) {
  const { outlet, merchant } = await requireCase(outletId);
  if (!DECIDABLE.includes(outlet.status)) notInReview();
  const text = note?.trim() ?? "";
  if (action !== "approve" && !text) {
    invalid("reason_required", "Write what the merchant should read.", "note");
  }

  const photos = (await outletPhotos([outlet.id])).get(outlet.id) ?? [];
  const { merged } = await outletChecklist(outlet, photos);
  const open = unanswered(merged);
  if (open.length) {
    invalid("checklist_incomplete", `Answer every check first - still open: ${open.map((m) => m.label).join(", ")}.`);
  }
  if (action === "approve") {
    if (flaggedItems(merged).length) {
      invalid("checklist_flagged", "Flagged checks can't be approved. Request changes or reject instead.");
    }
    if (merchant.approved_at === null) {
      invalid("merchant_not_approved", "Approve the merchant's account on the merchant file before approving its premises.");
    }
    if (photos.length < MIN_OUTLET_PHOTOS) {
      invalid("photos_required", `These premises need at least ${MIN_OUTLET_PHOTOS} photos.`);
    }
  }

  const status: OutletStatus = action === "approve" ? "live" : action === "request_changes" ? "action" : "rejected";
  const notificationIds: string[] = [];
  const updated = await db.transaction(async (trx) => {
    const [row] = await trx<OutletRow>("outlets")
      .where({ id: outlet.id })
      .whereIn("status", DECIDABLE)
      .update({
        status,
        reviewer_note: action === "approve" ? null : text,
        review_assignee: admin.adminId,
        decided_at: new Date(),
      })
      .returning("*");
    if (!row) notInReview();
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: action === "approve" ? "outlet.approved" : action === "request_changes" ? "outlet.changes_requested" : "outlet.rejected",
      entityType: "outlet",
      entityId: outlet.id,
      before: { status: outlet.status },
      after: { status, note: action === "approve" ? null : text, checklist: checklistSnapshot(merged) },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    notificationIds.push(
      await notify(trx, {
        merchantId: merchant.id,
        category: "review",
        title:
          action === "approve"
            ? `${row.name} is approved`
            : action === "request_changes"
              ? `${row.name} needs a change`
              : `${row.name} was not approved`,
        body:
          action === "approve"
            ? `CRAL visited ${row.name} in ${row.county}. These premises are approved.`
            : text,
        ref: row.name,
        subjectType: "outlet",
        subjectId: row.id,
      }),
    );
    return row;
  });
  await enqueueNotificationDelivery(merchant.id, notificationIds);
  return serializeCase(updated, merchant);
}

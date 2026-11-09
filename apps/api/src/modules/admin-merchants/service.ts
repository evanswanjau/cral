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
  splitByDocument,
  toBlock,
  documentChecklistState,
  resetDocumentChecks,
  unanswered,
  flaggedItems,
  undecidedUncheckedDocs,
  UnknownChecklistItem,
  type CheckResult,
  type MergedCheck,
} from "../../lib/review-checklist.js";
import { effectiveDocState } from "../vehicles/service.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import type { DocumentRow, DriverRow, MerchantRow, VehicleRow } from "../merchant/db-types.js";

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
  /** Submitted drivers (docs/plans/drivers.md) - a merchant with drivers and no car still needs its account approved. */
  drivers: number;
}

/** Loads every merchant that has at least one submitted vehicle or driver, with its tallies. */
async function loadAggregates(): Promise<MerchantAggregate[]> {
  const vehicles = await db<VehicleRow>("vehicles").whereIn("status", [...QUEUE_STATUSES]);
  const drivers = await db<DriverRow>("drivers").whereNot("status", "draft").select("merchant_id", "status", "county");
  if (vehicles.length === 0 && drivers.length === 0) return [];

  const merchantIds = [...new Set([...vehicles.map((v) => v.merchant_id), ...drivers.map((d) => d.merchant_id)])];
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
    const crew = drivers.filter((d) => d.merchant_id === merchant.id);
    return {
      merchant,
      phone: phoneByUser.get(merchant.user_id) ?? null,
      fleet: fleet.length,
      live: fleet.filter((v) => v.status === "live").length,
      waiting:
        fleet.filter((v) => (OPEN_STATUSES as readonly string[]).includes(v.status)).length +
        crew.filter((d) => (OPEN_STATUSES as readonly string[]).includes(d.status)).length,
      rejected: fleet.filter((v) => v.status === "rejected").length,
      towns: [...new Set([...fleet.map((v) => v.county), ...crew.map((d) => d.county)].filter((c): c is string => !!c))],
      drivers: crew.length,
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
        badge: badgeOf(a.merchant),
        contact: contactLine(a),
        joined: a.merchant.created_at.toISOString(),
        towns: a.towns,
        fleet: a.fleet,
        drivers: a.drivers,
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

/**
 * What the merchant's approval is called to them: a company has a
 * "business", an individual has an "account" (owner's call, 2026-09-25 -
 * someone renting out their own car isn't a business).
 */
function entityWord(m: MerchantRow): "business" | "account" {
  return m.owner_type === "company" ? "business" : "account";
}

/** Where the business review stands - the file's status chip and the list badge. */
function reviewStateOf(m: MerchantRow): "verified" | "changes_requested" | "in_review" {
  if (m.approved_at !== null) return "verified";
  if (m.review_changes_requested_at !== null) return "changes_requested";
  return "in_review";
}

function badgeOf(m: MerchantRow): "verified" | "changes_requested" | "new_merchant" {
  const s = reviewStateOf(m);
  return s === "in_review" ? "new_merchant" : s;
}

const AUDIT_EVENT: Record<string, { label: string; tone: "grey" | "blue" | "green" | "amber" | "red" }> = {
  "merchant.approved": { label: "Merchant approved", tone: "green" },
  "merchant.changes_requested": { label: "Changes requested", tone: "amber" },
  "merchant.approval_reopened": { label: "Approval reopened", tone: "amber" },
  "merchant.document_accepted": { label: "accepted", tone: "green" },
  "merchant.document_rejected": { label: "new upload requested", tone: "red" },
  "merchant.document_reopened": { label: "decision undone", tone: "grey" },
};

/**
 * The file's activity timeline. The merchant side has no events table of
 * its own, so this reads the admin decisions off `audit_log` - an Ops
 * reader behind `requireAdmin`, which is exactly where CLAUDE.md says an
 * audit reader may live. Document rows are deleted on re-upload, so a
 * replaced file's history drops out with it.
 */
async function merchantActivity(merchant: MerchantRow, ownerDocs: DocumentRow[]) {
  const docKind = new Map(ownerDocs.map((d) => [d.id, d.kind as string]));
  const rows = await db("audit_log")
    .where((q) => {
      q.where({ entity_type: "merchant", entity_id: merchant.id });
      if (docKind.size) q.orWhere((q2) => q2.where({ entity_type: "document" }).whereIn("entity_id", [...docKind.keys()]));
    })
    .whereIn("action", Object.keys(AUDIT_EVENT))
    .orderBy("created_at", "desc")
    .limit(30)
    .select("action", "entity_id", "actor_id", "after", "created_at");
  const adminIds = [...new Set(rows.map((r) => r.actor_id as string | null).filter((x): x is string => !!x))];
  const admins = adminIds.length
    ? await db<{ id: string; full_name: string }>("admin_users").whereIn("id", adminIds).select("id", "full_name")
    : [];
  const nameOf = new Map(admins.map((a) => [a.id, a.full_name]));
  return rows.map((r) => {
    const ev = AUDIT_EVENT[r.action as string]!;
    const after = (typeof r.after === "string" ? JSON.parse(r.after) : r.after) as Record<string, unknown> | null;
    const kind = docKind.get(r.entity_id as string);
    const viaChecklist = after?.via === "checklist";
    return {
      label: kind ? `${DOC_LABEL[kind] ?? kind} ${ev.label}${viaChecklist ? " - checklist complete" : ""}` : ev.label,
      body: typeof after?.note === "string" ? after.note : null,
      tone: ev.tone,
      actor_name: r.actor_id ? (nameOf.get(r.actor_id as string) ?? null) : null,
      occurred_at: (r.created_at as Date).toISOString(),
    };
  });
}

export async function getMerchantFile(merchantId: string) {
  const merchant = await requireMerchant(merchantId);

  const [user, vehicles, ownerDocs, docSets] = await Promise.all([
    db<{ id: string; phone: string | null; email: string; phone_verified: boolean; full_name: string | null }>("users")
      .where({ id: merchant.user_id })
      .first(),
    db<VehicleRow>("vehicles").where({ merchant_id: merchant.id }).whereIn("status", [...QUEUE_STATUSES]),
    db<DocumentRow>("documents").where({ merchant_id: merchant.id, vehicle_id: null, driver_id: null }),
    getMerchantApprovalDocs(),
  ]);
  const [checklist, events] = await Promise.all([
    merchantChecklist(merchant, ownerDocs),
    merchantActivity(merchant, ownerDocs),
  ]);
  const checksByDocument = splitByDocument(checklist.merged);

  // The business / account documents - this file's own review gate, each
  // with the checklist items that hang under it.
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
      expires_at: doc?.expires_at ?? null,
      reviewed_at: doc?.reviewed_at?.toISOString() ?? null,
      checklist: toBlock(checksByDocument.get(kind) ?? []),
    };
  });
  const docsOutstanding = businessDocuments.filter((d) => d.state !== "ok").map((d) => d.kind);
  const block = checklist.block;
  const undecided = undecidedUncheckedDocs(ownerDocs, checklist.merged, requiredDocs);
  const reviewComplete = block.complete && undecided.length === 0;
  const canApprove = reviewComplete && block.flagged === 0 && docsOutstanding.length === 0;
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

  // The merchant's submitted drivers (docs/plans/drivers.md) - each is its
  // own case on the drivers queue; listed here so Ops sees the whole account.
  const drivers = await db<DriverRow>("drivers")
    .where({ merchant_id: merchant.id })
    .whereNot("status", "draft")
    .orderBy("created_at", "asc")
    .select("id", "full_name", "status", "county");

  const agg = {
    fleet: vehicles.length,
    live: vehicles.filter((v) => v.status === "live").length,
    waiting: vehicles.filter((v) => (OPEN_STATUSES as readonly string[]).includes(v.status)).length,
    rejected: vehicles.filter((v) => v.status === "rejected").length,
  };
  const name = merchantDisplayName(merchant);
  const towns = [...new Set(vehicles.map((v) => v.county).filter((c): c is string => !!c))];

  // Oldest still-open case — the "Review <plate>" prompt jumps to it.
  const nextCase = vehicles
    .filter((v) => (OPEN_STATUSES as readonly string[]).includes(v.status))
    .sort((a, b) => (a.submitted_at ?? a.created_at).getTime() - (b.submitted_at ?? b.created_at).getTime())[0];

  const approved = merchant.approved_at !== null;
  const note = !approved
    ? `Approving a vehicle does not verify the ${entityWord(merchant)} - those are two separate decisions.`
    : agg.rejected > 0
      ? `${agg.rejected} earlier submission${agg.rejected === 1 ? " was" : "s were"} rejected. Read what they were told before you decide again.`
      : null;
  const isCompany = merchant.owner_type === "company";
  const personName = [merchant.first_name, merchant.middle_name, merchant.surname].filter(Boolean).join(" ") || null;

  return {
    id: merchant.id,
    name,
    initials: initials(name),
    approved,
    approved_at: merchant.approved_at?.toISOString() ?? null,
    badge: badgeOf(merchant),
    review_state: reviewStateOf(merchant),
    review_note: merchant.review_note,
    changes_requested_at: merchant.review_changes_requested_at?.toISOString() ?? null,
    owner_type: merchant.owner_type,
    contact: [isCompany ? [merchant.first_name, merchant.surname].filter(Boolean).join(" ") : name, user?.phone ?? null]
      .filter(Boolean)
      .join(" · ") || "No contact on file",
    joined: merchant.created_at.toISOString(),
    towns,
    note,
    // Checklist-first: nothing can be decided until every item is answered.
    can_decide: reviewComplete,
    can_approve: canApprove,
    approve_blockers: {
      checklist_outstanding: block.outstanding + undecided.length,
      flagged: block.flagged,
      documents: docsOutstanding.length,
    },
    outstanding_documents: docsOutstanding,
    business_documents: businessDocuments,
    /** Items about the account as a whole (no document row). */
    business_checklist: toBlock(checksByDocument.get("other") ?? []),
    checklist: block,
    // What the merchant typed - the checklist asks the reviewer to compare
    // these against the scans, so they sit beside them.
    declared: {
      person: {
        full_name: personName,
        national_id: merchant.national_id,
        kra_pin: merchant.kra_pin,
      },
      company: isCompany
        ? {
            name: merchant.company_name,
            cert_no: merchant.company_cert_no,
            kra_pin: merchant.company_kra,
            email: merchant.company_email,
            address: merchant.company_address,
          }
        : null,
      contact: {
        email: user?.email ?? null,
        phone: user?.phone ?? null,
        phone_verified: user?.phone_verified ?? false,
      },
      payout: {
        method: merchant.payout_method,
        mpesa_name: merchant.payout_mpesa_name,
        bank_name: merchant.bank_name,
        bank_account_name: merchant.bank_account_name,
        bank_account_number: merchant.bank_account_number,
      },
    },
    events,
    stats: {
      submitted: agg.fleet,
      live: agg.live,
      waiting: agg.waiting,
      rejected: agg.rejected,
    },
    review_next: nextCase ? { id: nextCase.id, registration: nextCase.registration } : null,
    drivers: drivers.map((d) => ({ id: d.id, full_name: d.full_name, status: d.status, county: d.county })),
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
  decision: "accept" | "reject" | "reset",
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
      message: "Write what the merchant should read before asking for a new upload.",
      field: "note",
    });
  }

  const doc = await db<DocumentRow>("documents")
    .where({ merchant_id: merchant.id, vehicle_id: null, driver_id: null, kind: kind as DocumentRow["kind"] })
    .first();
  if (!doc) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "document_not_uploaded",
      message: "Nothing is uploaded on that line yet.",
    });
  }

  const { merged } = await merchantChecklist(merchant);
  if (decision === "accept") {
    const state = documentChecklistState(merged, kind);
    if (state === "incomplete" || state === "flagged") {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: state === "incomplete" ? "checklist_incomplete" : "checklist_flagged",
        message:
          state === "incomplete"
            ? "Work every check under this document before accepting it."
            : "A check under this document is flagged - it can't be accepted as it stands.",
      });
    }
  }

  const nextState = decision === "accept" ? "ok" : decision === "reject" ? "rejected" : "pending";
  const notificationIds: string[] = [];
  await db.transaction(async (trx) => {
    await trx<DocumentRow>("documents")
      .where({ id: doc.id })
      .update({
        review_state: nextState,
        review_note: decision === "reject" ? note!.trim() : null,
        reviewed_by: decision === "reset" ? null : admin.adminId,
        reviewed_at: decision === "reset" ? null : new Date(),
      });
    if (decision === "reset") {
      await resetDocumentChecks(
        trx,
        "merchant_review_checks",
        { merchant_id: merchant.id },
        merged.filter((m) => m.document === kind).map((m) => m.id),
      );
    }
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action:
        decision === "accept"
          ? "merchant.document_accepted"
          : decision === "reject"
            ? "merchant.document_rejected"
            : "merchant.document_reopened",
      entityType: "document",
      entityId: doc.id,
      before: { review_state: doc.review_state },
      after: { review_state: nextState, kind, ...(decision === "reject" ? { note: note!.trim() } : {}) },
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
  await syncBusinessDocWithChecklist(merchant, itemId, admin);
  return getMerchantFile(merchantId);
}

/**
 * Same rule as the vehicle case: a business document's `review_state`
 * follows the checklist under it - all passed -> accepted (silently), an
 * accepted document whose checklist stops being all-pass -> pending. A
 * rejected document waits for the merchant's re-upload.
 */
async function syncBusinessDocWithChecklist(merchant: MerchantRow, itemId: string, admin: AdminCtx) {
  const { merged } = await merchantChecklist(merchant);
  const kind = merged.find((m) => m.id === itemId)?.document ?? null;
  if (!kind) return;
  const doc = await db<DocumentRow>("documents")
    .where({ merchant_id: merchant.id, vehicle_id: null, driver_id: null, kind: kind as DocumentRow["kind"] })
    .first();
  if (!doc || doc.review_state === "rejected") return;

  const passed = documentChecklistState(merged, kind) === "passed";
  if (passed === (doc.review_state === "ok")) return;
  const nextState = passed ? "ok" : "pending";
  await db.transaction(async (trx) => {
    await trx<DocumentRow>("documents").where({ id: doc.id }).update({
      review_state: nextState,
      review_note: null,
      reviewed_by: passed ? admin.adminId : null,
      reviewed_at: passed ? new Date() : null,
    });
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: passed ? "merchant.document_accepted" : "merchant.document_reopened",
      entityType: "document",
      entityId: doc.id,
      before: { review_state: doc.review_state },
      after: { review_state: nextState, kind, via: "checklist" },
      requestId: admin.requestId,
      ip: admin.ip,
    });
  });
}

function assertChecklistComplete(merged: MergedCheck[], undecidedDocs: string[] = []): void {
  const open = unanswered(merged).length + undecidedDocs.length;
  if (open) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "checklist_incomplete",
      message: `Finish the checklist first - ${open} check${open === 1 ? "" : "s"} still to answer.`,
    });
  }
}

// ---------------------------------------------------------------------
// Approve / request changes / reopen
// ---------------------------------------------------------------------

export async function approveMerchant(merchantId: string, admin: AdminCtx) {
  const merchant = await requireMerchant(merchantId);
  if (merchant.approved_at !== null) return getMerchantFile(merchantId);

  const [ownerDocs, docSets] = await Promise.all([
    db<DocumentRow>("documents").where({ merchant_id: merchant.id, vehicle_id: null, driver_id: null }),
    getMerchantApprovalDocs(),
  ]);
  const checklist = await merchantChecklist(merchant, ownerDocs);
  const required = merchantApprovalDocsFor(merchant.owner_type, docSets);
  assertChecklistComplete(checklist.merged, undecidedUncheckedDocs(ownerDocs, checklist.merged, required));

  const docsOutstanding = required.filter(
    (kind) => effectiveDocState(ownerDocs.find((d) => d.kind === kind)) !== "ok",
  );
  if (docsOutstanding.length) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "documents_not_all_accepted",
      message: `Accept every ${entityWord(merchant)} document first — still outstanding: ${docsOutstanding.join(", ")}.`,
    });
  }
  const flagged = flaggedItems(checklist.merged);
  if (flagged.length) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "checklist_flagged",
      message: `A flagged check can't be approved - request changes instead. Flagged: ${flagged.map((f) => f.label).join("; ")}.`,
    });
  }

  const notificationIds: string[] = [];
  await db.transaction(async (trx) => {
    await trx("merchants")
      .where({ id: merchant.id })
      .update({ approved_at: new Date(), review_changes_requested_at: null, review_note: null });
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
        title: `Your ${entityWord(merchant)} is verified`,
        body: "Your account documents have been approved. New vehicles now only need their own documents checked.",
        subjectType: null,
        subjectId: null,
      }),
    );
  });
  await enqueueNotificationDelivery(merchant.id, notificationIds);
  return getMerchantFile(merchantId);
}

/**
 * The business-level "Request changes": the merchant is told what to fix
 * (in-app, and by SMS/email - `review` always texts), and the file reads
 * "Changes sent" until an approve clears it. Checklist-first, same as
 * every other decision.
 */
export async function requestMerchantChanges(merchantId: string, note: string, admin: AdminCtx) {
  const merchant = await requireMerchant(merchantId);
  if (merchant.approved_at !== null) {
    throw new ApiError({
      status: 409,
      type: "conflict",
      code: "merchant_already_approved",
      message: `This ${entityWord(merchant)} is already verified. Reopen the review first.`,
    });
  }
  const [ownerDocs, docSets] = await Promise.all([
    db<DocumentRow>("documents").where({ merchant_id: merchant.id, vehicle_id: null, driver_id: null }),
    getMerchantApprovalDocs(),
  ]);
  const checklist = await merchantChecklist(merchant, ownerDocs);
  assertChecklistComplete(
    checklist.merged,
    undecidedUncheckedDocs(ownerDocs, checklist.merged, merchantApprovalDocsFor(merchant.owner_type, docSets)),
  );

  const trimmed = note.trim();
  const notificationIds: string[] = [];
  await db.transaction(async (trx) => {
    await trx("merchants")
      .where({ id: merchant.id })
      .update({ review_changes_requested_at: new Date(), review_note: trimmed });
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: "merchant.changes_requested",
      entityType: "merchant",
      entityId: merchant.id,
      before: { review_note: merchant.review_note },
      after: { note: trimmed, checklist: checklistSnapshot(checklist.merged) },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    notificationIds.push(
      await notify(trx, {
        merchantId: merchant.id,
        category: "review",
        title: merchant.owner_type === "company" ? "Your business details need a change" : "Your account details need a change",
        body: trimmed,
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
    .where({ id: documentId, merchant_id: merchantId, vehicle_id: null, driver_id: null })
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

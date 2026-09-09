import { ApiError, kes, type Money } from "@cral/types";
import { db } from "../../db/client.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { appendVehicleEvent, nextListingRef } from "../../lib/vehicle-events.js";
import { notify } from "../../lib/notifications.js";
import { enqueueNotificationDelivery } from "../../jobs/notification-delivery.js";
import {
  getVehicleReviewSettings,
  getMerchantApprovalDocs,
  merchantApprovalDocsFor,
} from "../../lib/platform-settings.js";
import { runVehicleChecks } from "../../lib/vehicle-checks.js";
import {
  vehicleChecklist,
  setVehicleCheck,
  checklistSnapshot,
  splitByDocument,
  documentChecksAllPass,
  toBlock,
  UnknownChecklistItem,
  type CheckResult,
} from "../../lib/review-checklist.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import { effectiveDocState } from "../vehicles/service.js";
import { nairobiDayStartUtc } from "../../lib/dates.js";
import { merchantDisplayName, initials as initialsOf } from "../../lib/merchant-display.js";
import type {
  DocumentRow,
  MerchantRow,
  VehicleEventRow,
  VehicleRow,
} from "../merchant/db-types.js";

export interface AdminContextInput {
  adminId: string;
  adminName: string;
  ip: string | null;
  requestId: string | null;
}

// The three per-vehicle documents (the queue's "DOCS n/3" chip counts these).
const VEHICLE_DOC_KINDS = ["logbook", "comprehensive_insurance", "tracker_certificate"] as const;

// backend `vehicles.status` -> the design's five review-queue slugs.
const STATUS_TO_BUCKET = {
  pending: "needs_review",
  review: "with_you",
  action: "changes_sent",
  live: "approved",
  rejected: "rejected",
} as const;
type Bucket = (typeof STATUS_TO_BUCKET)[keyof typeof STATUS_TO_BUCKET];
const QUEUE_STATUSES = Object.keys(STATUS_TO_BUCKET) as Array<keyof typeof STATUS_TO_BUCKET>;
const BUCKET_TO_STATUS: Record<Bucket, keyof typeof STATUS_TO_BUCKET> = {
  needs_review: "pending",
  with_you: "review",
  changes_sent: "action",
  approved: "live",
  rejected: "rejected",
};

let storageAdapter: ReturnType<typeof createStorageAdapter> | null = null;
function storage(): ReturnType<typeof createStorageAdapter> {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

// ---------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------

async function requireCase(vehicleId: string): Promise<{ vehicle: VehicleRow; merchant: MerchantRow }> {
  const vehicle = await db<VehicleRow>("vehicles").where({ id: vehicleId }).first();
  if (!vehicle || vehicle.status === "draft") {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "review_case_not_found",
      message: "No review case for that vehicle.",
    });
  }
  const merchant = await db<MerchantRow>("merchants").where({ id: vehicle.merchant_id }).first();
  if (!merchant) throw new Error(`vehicle ${vehicleId} has no merchant row`);
  return { vehicle, merchant };
}

const merchantName = merchantDisplayName;

function waitingHours(v: VehicleRow): number {
  const since = (v.submitted_at ?? v.created_at).getTime();
  return Math.max(0, Math.round((Date.now() - since) / (60 * 60 * 1000)));
}

function moneyOrNull(v: VehicleRow): Money | null {
  return v.daily_rate_amount ? kes(v.daily_rate_amount) : null;
}

/** Accepted count over the three per-vehicle docs, plus whether any is rejected/missing. */
function vehicleDocProgress(vehicleDocs: DocumentRow[]): { accepted: number; total: number; hasIssue: boolean } {
  let accepted = 0;
  let hasIssue = false;
  for (const kind of VEHICLE_DOC_KINDS) {
    const state = effectiveDocState(vehicleDocs.find((d) => d.kind === kind));
    if (state === "ok") accepted++;
    else if (state === "missing" || state === "rejected") hasIssue = true;
  }
  return { accepted, total: VEHICLE_DOC_KINDS.length, hasIssue };
}

async function assigneeLabel(assigneeId: string | null, cache: Map<string, string>): Promise<string | null> {
  if (!assigneeId) return null;
  if (cache.has(assigneeId)) return cache.get(assigneeId)!;
  const admin = await db<{ id: string; full_name: string }>("admin_users")
    .where({ id: assigneeId })
    .first();
  const label = admin ? initialsOf(admin.full_name) : "??";
  cache.set(assigneeId, label);
  return label;
}

// ---------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------

export interface QueueQuery {
  bucket?: Bucket | "all";
  mineOnly?: boolean;
  cursor?: string;
  limit: number;
}

export async function listReviewQueue(admin: AdminContextInput, query: QueueQuery) {
  const settings = await getVehicleReviewSettings();

  let base = db<VehicleRow>("vehicles").whereIn("status", QUEUE_STATUSES);
  if (query.bucket && query.bucket !== "all") base = base.andWhere({ status: BUCKET_TO_STATUS[query.bucket] });
  if (query.mineOnly) base = base.andWhere({ review_assignee: admin.adminId });

  const rows = (await applyCursor(base.clone(), {
    sortColumn: "submitted_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  })) as VehicleRow[];

  const page = toPaginatedResult(
    rows.map((r) => ({ ...r, submitted_at: r.submitted_at ?? r.created_at })),
    query.limit,
    "submitted_at",
  );

  const merchantIds = [...new Set(page.data.map((v) => v.merchant_id))];
  const merchants = merchantIds.length
    ? await db<MerchantRow>("merchants").whereIn("id", merchantIds)
    : [];
  const merchantById = new Map(merchants.map((m) => [m.id, m]));
  const vehicleIds = page.data.map((v) => v.id);
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
  const assigneeCache = new Map<string, string>();
  const slaHours = settings.slaDays * 24;

  const data = await Promise.all(
    page.data.map(async (v) => {
      const m = merchantById.get(v.merchant_id);
      const progress = vehicleDocProgress(docsByVehicle.get(v.id) ?? []);
      const hours = waitingHours(v);
      return {
        id: v.id,
        registration: v.registration,
        title: [v.make, v.model].filter(Boolean).join(" "),
        type: v.type,
        year: v.year,
        county: v.county,
        merchant_id: v.merchant_id,
        merchant_name: m ? merchantName(m) : "(unknown)",
        status: v.status,
        bucket: STATUS_TO_BUCKET[v.status as keyof typeof STATUS_TO_BUCKET],
        docs_accepted: progress.accepted,
        docs_total: progress.total,
        docs_has_issue: progress.hasIssue,
        waiting_hours: hours,
        overdue: hours > slaHours,
        assignee_initials: await assigneeLabel(v.review_assignee, assigneeCache),
        assigned_to_me: v.review_assignee === admin.adminId,
        submitted_at: (v.submitted_at ?? v.created_at).toISOString(),
      };
    }),
  );

  // Whole-set counts per bucket, plus this reviewer's own numbers.
  const grouped = await db<VehicleRow>("vehicles")
    .whereIn("status", QUEUE_STATUSES)
    .select("status")
    .count<{ status: string; count: string }[]>("* as count")
    .groupBy("status");
  const counts: Record<Bucket | "all", number> = {
    needs_review: 0,
    with_you: 0,
    changes_sent: 0,
    approved: 0,
    rejected: 0,
    all: 0,
  };
  for (const g of grouped) {
    const bucket = STATUS_TO_BUCKET[g.status as keyof typeof STATUS_TO_BUCKET];
    if (bucket) counts[bucket] = Number(g.count);
    counts.all += Number(g.count);
  }

  const openStatuses = ["pending", "review"];
  const mineOpen = await db<VehicleRow>("vehicles")
    .where({ review_assignee: admin.adminId })
    .whereIn("status", openStatuses)
    .count<{ count: string }[]>("* as count");
  const mineBreached = await db<VehicleRow>("vehicles")
    .where({ review_assignee: admin.adminId })
    .whereIn("status", openStatuses)
    .andWhere("submitted_at", "<", new Date(Date.now() - slaHours * 60 * 60 * 1000))
    .count<{ count: string }[]>("* as count");

  const dayStart = nairobiDayStartUtc(new Date());
  const decidedRows = await db("audit_log")
    .where({ actor_id: admin.adminId, actor_type: "admin" })
    .whereIn("action", ["vehicle.approved", "vehicle.changes_requested", "vehicle.rejected"])
    .andWhere("created_at", ">=", dayStart)
    .select("action")
    .count<{ action: string; count: string }[]>("* as count")
    .groupBy("action");
  const decidedToday = { approved: 0, changes: 0, rejected: 0 };
  for (const r of decidedRows) {
    if (r.action === "vehicle.approved") decidedToday.approved = Number(r.count);
    if (r.action === "vehicle.changes_requested") decidedToday.changes = Number(r.count);
    if (r.action === "vehicle.rejected") decidedToday.rejected = Number(r.count);
  }

  return {
    data,
    next_cursor: page.next_cursor,
    has_more: page.has_more,
    counts,
    sla_days: settings.slaDays,
    mine: { assigned_open: Number(mineOpen[0]?.count ?? 0), breached: Number(mineBreached[0]?.count ?? 0) },
    decided_today: decidedToday,
  };
}

// ---------------------------------------------------------------------
// Case
// ---------------------------------------------------------------------

const DOC_LABEL: Record<string, string> = {
  logbook: "Logbook",
  comprehensive_insurance: "Comprehensive insurance",
  tracker_certificate: "Tracker certificate",
  national_id: "Owner ID",
  kra_pin: "KRA PIN certificate",
  certificate_of_incorporation: "Certificate of Incorporation",
  company_kra_pin: "Company KRA PIN certificate",
  cr12: "CR12",
};

async function serializeCase(vehicle: VehicleRow, merchant: MerchantRow) {
  const settings = await getVehicleReviewSettings();
  const [vehicleDocs, ownerDocs, events, user, checks, merchantDocSets, checklist] = await Promise.all([
    db<DocumentRow>("documents").where({ vehicle_id: vehicle.id }),
    db<DocumentRow>("documents").where({ merchant_id: merchant.id, vehicle_id: null }),
    db<VehicleEventRow>("vehicle_events").where({ vehicle_id: vehicle.id }).orderBy("occurred_at", "desc"),
    db<{ id: string; phone: string | null }>("users").where({ id: merchant.user_id }).first(),
    (async () => runVehicleChecks(db, vehicle, settings.autoChecks))(),
    getMerchantApprovalDocs(),
    vehicleChecklist(vehicle),
  ]);

  const photos = vehicleDocs.filter((d) => d.kind === "vehicle_photo");
  const name = merchantName(merchant);
  const merchantApproved = merchant.approved_at !== null;

  // The checklist, split so each document carries its own accordion block.
  const checksByDocument = splitByDocument(checklist.merged);

  const docLine = (kind: string) => {
    const doc = vehicleDocs.find((d) => d.kind === kind);
    return {
      kind,
      scope: "vehicle" as const,
      label: DOC_LABEL[kind] ?? kind,
      state: effectiveDocState(doc),
      document_id: doc?.id ?? null,
      review_note: doc?.review_note ?? null,
      original_name: doc?.original_name ?? null,
      expires_at: doc?.expires_at ?? null,
      checklist: toBlock(checksByDocument.get(kind) ?? []),
    };
  };

  // The car's own three documents - the per-vehicle gate.
  const documents = settings.requiredDocumentKinds.map(docLine);
  const outstanding = documents.filter((d) => d.state !== "ok").map((d) => d.kind);

  // The merchant's own documents - context only. An approved merchant has
  // already cleared these; an unapproved one shows their real state and a
  // link to the merchant file (the second gate lives there).
  const accountDocuments = merchantApprovalDocsFor(merchant.owner_type, merchantDocSets).map((kind) => {
    const doc = ownerDocs.find((d) => d.kind === kind);
    return {
      kind,
      label: DOC_LABEL[kind] ?? kind,
      state: merchantApproved ? ("ok" as const) : effectiveDocState(doc),
      verified_with_account: merchantApproved,
    };
  });

  // Merchant history: prior rejections across this merchant's whole fleet.
  const priorRejections = await db<VehicleRow>("vehicles")
    .where({ merchant_id: merchant.id })
    .andWhereNot({ id: vehicle.id })
    .andWhere({ status: "rejected" })
    .count<{ count: string }[]>("* as count");
  const liveCount = await db<VehicleRow>("vehicles")
    .where({ merchant_id: merchant.id, status: "live" })
    .count<{ count: string }[]>("* as count");

  const hours = waitingHours(vehicle);

  return {
    id: vehicle.id,
    registration: vehicle.registration,
    listing_ref: vehicle.listing_ref,
    title: [vehicle.make, vehicle.model].filter(Boolean).join(" "),
    type: vehicle.type,
    year: vehicle.year,
    seats: vehicle.seats,
    transmission: vehicle.transmission,
    fuel: vehicle.fuel,
    colour: vehicle.colour,
    county: vehicle.county,
    pickup_address: vehicle.pickup_address,
    status: vehicle.status,
    bucket: STATUS_TO_BUCKET[vehicle.status as keyof typeof STATUS_TO_BUCKET],
    minimum_hire_days: vehicle.minimum_hire_days,
    chauffeured: vehicle.chauffeured,
    daily_rate: moneyOrNull(vehicle),
    submitted_at: (vehicle.submitted_at ?? vehicle.created_at).toISOString(),
    waiting_hours: hours,
    sla_days: settings.slaDays,
    overdue: hours > settings.slaDays * 24,
    reviewer_note: vehicle.reviewer_note,
    reviewer_note_resolved: vehicle.reviewer_note_resolved,
    assigned_to_me: vehicle.review_assignee !== null,
    can_approve:
      outstanding.length === 0 &&
      checklist.block.blockers_outstanding === 0 &&
      merchantApproved,
    approve_blockers: {
      documents: outstanding.length,
      checklist: checklist.block.blockers_outstanding,
      merchant_not_approved: !merchantApproved,
    },
    outstanding_documents: outstanding,
    merchant_approved: merchantApproved,
    documents,
    account_documents: accountDocuments,
    checklist: checklist.block,
    photos_checklist: toBlock(checksByDocument.get("photos") ?? []),
    photos: photos.map((p) => ({ document_id: p.id, original_name: p.original_name })),
    // Advisory automatic checks still run and ship in the payload, but the
    // case screen no longer surfaces them - the reviewer confirms the same
    // things (e.g. insurance not expired) on the document checklist.
    checks: checks.map((c) => ({ id: c.id, outcome: c.outcome, label: c.label, detail: c.detail })),
    events: events.map((e) => ({
      label: e.label,
      body: e.body,
      tone: e.tone,
      actor_name: e.actor_name,
      occurred_at: e.occurred_at.toISOString(),
    })),
    merchant: {
      id: merchant.id,
      name,
      initials: initialsOf(name),
      owner_type: merchant.owner_type,
      contact_phone: user?.phone ?? null,
      // "Documents pending" vs "Verified" — reflects merchants.approved_at,
      // which nothing sets yet (account approval is its own slice).
      approved: merchant.approved_at !== null,
      member_since: merchant.created_at.toISOString(),
      live_vehicles: Number(liveCount[0]?.count ?? 0),
      prior_rejections: Number(priorRejections[0]?.count ?? 0),
    },
  };
}

export async function getReviewCase(vehicleId: string) {
  const { vehicle, merchant } = await requireCase(vehicleId);
  return serializeCase(vehicle, merchant);
}

// ---------------------------------------------------------------------
// Assign
// ---------------------------------------------------------------------

export async function assignCase(vehicleId: string, admin: AdminContextInput) {
  const { vehicle, merchant } = await requireCase(vehicleId);
  if (vehicle.review_assignee === admin.adminId && vehicle.status !== "pending") {
    return serializeCase(vehicle, merchant);
  }

  const updated = await db.transaction(async (trx) => {
    const nextStatus = vehicle.status === "pending" ? "review" : vehicle.status;
    const [row] = await trx<VehicleRow>("vehicles")
      .where({ id: vehicle.id })
      .update({ review_assignee: admin.adminId, status: nextStatus })
      .returning("*");
    if (!row) throw new Error("assign failed");
    await appendVehicleEvent(trx, {
      vehicleId: vehicle.id,
      merchantId: merchant.id,
      kind: "assigned",
      tone: "blue",
      label: `Assigned to ${admin.adminName}`,
      actorType: "reviewer",
      actorName: admin.adminName,
    });
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: "vehicle.assigned",
      entityType: "vehicle",
      entityId: vehicle.id,
      before: { status: vehicle.status, review_assignee: vehicle.review_assignee },
      after: { status: nextStatus, review_assignee: admin.adminId },
      requestId: admin.requestId,
      ip: admin.ip,
    });
    return row;
  });

  return serializeCase(updated, merchant);
}

// ---------------------------------------------------------------------
// Document decision
// ---------------------------------------------------------------------

// Only the car's own documents are decided here. The merchant's documents
// (national_id / kra_pin / the company set) are reviewed on the merchant
// file - the second gate. See docs/plans/admin-review-checklist.md.
const REVIEWABLE_DOC_KINDS = [...VEHICLE_DOC_KINDS];

export async function decideDocument(
  vehicleId: string,
  kind: string,
  decision: "accept" | "reject",
  note: string | null,
  admin: AdminContextInput,
) {
  if (!(REVIEWABLE_DOC_KINDS as readonly string[]).includes(kind)) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "not_a_reviewable_document",
      message: `"${kind}" is not a document this screen reviews.`,
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

  const { vehicle, merchant } = await requireCase(vehicleId);
  const doc = await db<DocumentRow>("documents")
    .where({ vehicle_id: vehicle.id, kind: kind as DocumentRow["kind"] })
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

    await appendVehicleEvent(trx, {
      vehicleId: vehicle.id,
      merchantId: merchant.id,
      kind: decision === "accept" ? "document_accepted" : "document_rejected",
      tone: decision === "accept" ? "green" : "red",
      label: `${DOC_LABEL[kind] ?? kind} ${decision === "accept" ? "accepted" : "rejected"}`,
      body: decision === "reject" ? note!.trim() : null,
      actorType: "reviewer",
      actorName: admin.adminName,
    });
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: decision === "accept" ? "admin.document_accepted" : "admin.document_rejected",
      entityType: "document",
      entityId: doc.id,
      before: { review_state: doc.review_state },
      after: { review_state: nextState, kind },
      requestId: admin.requestId,
      ip: admin.ip,
    });

    // Only a rejection reaches the merchant — an accept is silent (the
    // whole-listing decision is the notification that matters).
    if (decision === "reject") {
      notificationIds.push(
        await notify(trx, {
          merchantId: merchant.id,
          category: "review",
          title: `${DOC_LABEL[kind] ?? kind} on ${vehicle.registration} needs another look`,
          body: note!.trim(),
          ref: vehicle.registration,
          subjectType: "vehicle",
          subjectId: vehicle.id,
        }),
      );
    }
  });

  if (notificationIds.length) await enqueueNotificationDelivery(merchant.id, notificationIds);
  return getReviewCase(vehicleId);
}

// ---------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------

export async function setChecklistItem(
  vehicleId: string,
  itemId: string,
  result: CheckResult,
  note: string | null,
  admin: AdminContextInput,
) {
  const { vehicle, merchant } = await requireCase(vehicleId);
  try {
    await setVehicleCheck(vehicle, itemId, result, note?.trim() || null, admin.adminId);
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

  // Passing the last blocking check under a document accepts that document.
  await maybeAutoAcceptDocument(vehicle, merchant, itemId, admin);

  return getReviewCase(vehicleId);
}

/**
 * When every `block` checklist item under a real car document is now
 * `pass`, mark that document accepted (once) - the same effect as the
 * reviewer clicking Accept, minus the merchant notification (an accept is
 * silent either way). A rejected line is left alone; the merchant must
 * re-upload it. Photos have no document row, so they never trigger this.
 */
async function maybeAutoAcceptDocument(
  vehicle: VehicleRow,
  merchant: MerchantRow,
  itemId: string,
  admin: AdminContextInput,
) {
  const { merged } = await vehicleChecklist(vehicle);
  const item = merged.find((m) => m.id === itemId);
  const kind = item?.document ?? null;
  if (!kind || !(VEHICLE_DOC_KINDS as readonly string[]).includes(kind)) return;
  if (!documentChecksAllPass(merged, kind)) return;

  const doc = await db<DocumentRow>("documents")
    .where({ vehicle_id: vehicle.id, kind: kind as DocumentRow["kind"] })
    .first();
  if (!doc || doc.review_state === "ok" || doc.review_state === "rejected") return;

  await db.transaction(async (trx) => {
    await trx<DocumentRow>("documents").where({ id: doc.id }).update({
      review_state: "ok",
      review_note: null,
      reviewed_by: admin.adminId,
      reviewed_at: new Date(),
    });
    await appendVehicleEvent(trx, {
      vehicleId: vehicle.id,
      merchantId: merchant.id,
      kind: "document_accepted",
      tone: "green",
      label: `${DOC_LABEL[kind] ?? kind} accepted - checklist complete`,
      actorType: "reviewer",
      actorName: admin.adminName,
    });
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: "admin.document_accepted",
      entityType: "document",
      entityId: doc.id,
      before: { review_state: doc.review_state },
      after: { review_state: "ok", kind, via: "checklist" },
      requestId: admin.requestId,
      ip: admin.ip,
    });
  });
}

// ---------------------------------------------------------------------
// Listing decision
// ---------------------------------------------------------------------

export type ListingAction = "approve" | "request_changes" | "reject";

export async function decideListing(
  vehicleId: string,
  action: ListingAction,
  note: string | null,
  admin: AdminContextInput,
) {
  const { vehicle, merchant } = await requireCase(vehicleId);
  const { merged: checklistMerged } = await vehicleChecklist(vehicle);

  if ((action === "request_changes" || action === "reject") && !note?.trim()) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "reason_required",
      message: "Write what the merchant should read.",
      field: "note",
    });
  }

  if (action === "approve") {
    // Gate 1: the business. A car can't go live for an unverified merchant.
    if (merchant.approved_at === null) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "merchant_not_approved",
        message: "Approve the business on the merchant file before publishing one of its cars.",
      });
    }
    // Gate 2: the car's three documents.
    const settings = await getVehicleReviewSettings();
    const vehicleDocs = await db<DocumentRow>("documents").where({ vehicle_id: vehicle.id });
    const outstanding = settings.requiredDocumentKinds.filter(
      (kind) => effectiveDocState(vehicleDocs.find((d) => d.kind === kind)) !== "ok",
    );
    if (outstanding.length) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "documents_not_all_accepted",
        message: `Accept every document first — still outstanding: ${outstanding.join(", ")}.`,
      });
    }
    // Gate 3: every blocking checklist item passed.
    const blocking = checklistMerged.filter((m) => m.severity === "block" && m.result !== "pass");
    if (blocking.length) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "checklist_blockers_outstanding",
        message: `Work the checklist first — still open: ${blocking.map((b) => b.label).join("; ")}.`,
      });
    }
  }

  const notificationIds: string[] = [];
  const updated = await db.transaction(async (trx) => {
    const patch: Partial<VehicleRow> = { review_assignee: admin.adminId };
    let eventTone: "green" | "amber" | "red" = "green";
    let eventLabel = "";
    let auditAction = "";

    if (action === "approve") {
      patch.status = "live";
      patch.reviewer_note = null;
      patch.reviewer_note_resolved = true;
      if (!vehicle.listing_ref) patch.listing_ref = await nextListingRef(trx);
      eventTone = "green";
      eventLabel = "Approved and published";
      auditAction = "vehicle.approved";
    } else if (action === "request_changes") {
      patch.status = "action";
      patch.reviewer_note = note!.trim();
      patch.reviewer_note_meta = "From your reviewer";
      patch.reviewer_note_resolved = false;
      eventTone = "amber";
      eventLabel = "Changes requested";
      auditAction = "vehicle.changes_requested";
    } else {
      patch.status = "rejected";
      patch.reviewer_note = note!.trim();
      patch.reviewer_note_meta = "From your reviewer";
      eventTone = "red";
      eventLabel = "Rejected";
      auditAction = "vehicle.rejected";
    }

    const [row] = await trx<VehicleRow>("vehicles").where({ id: vehicle.id }).update(patch).returning("*");
    if (!row) throw new Error("decision failed");

    await appendVehicleEvent(trx, {
      vehicleId: vehicle.id,
      merchantId: merchant.id,
      kind: auditAction.split(".")[1]!,
      tone: eventTone,
      label: eventLabel,
      body: action === "approve" ? `Live in ${vehicle.county ?? "search"}.` : note!.trim(),
      actorType: "reviewer",
      actorName: admin.adminName,
    });
    await writeAuditEntry(trx, {
      actorId: admin.adminId,
      actorType: "admin",
      action: auditAction,
      entityType: "vehicle",
      entityId: vehicle.id,
      before: { status: vehicle.status },
      after: { status: patch.status, checklist: checklistSnapshot(checklistMerged) },
      requestId: admin.requestId,
      ip: admin.ip,
    });

    const title =
      action === "approve"
        ? `${row.registration} is live`
        : action === "request_changes"
          ? `${row.registration} needs a change before it can go live`
          : `${row.registration} was not approved`;
    notificationIds.push(
      await notify(trx, {
        merchantId: merchant.id,
        category: "review",
        title,
        body: action === "approve" ? `Your listing is live in ${row.county ?? "search"}.` : note!.trim(),
        ref: row.registration,
        subjectType: "vehicle",
        subjectId: vehicle.id,
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

export async function readCaseDocument(documentId: string) {
  const doc = await db<DocumentRow>("documents").where({ id: documentId }).first();
  if (!doc) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "document_not_found",
      message: "That document doesn't exist.",
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

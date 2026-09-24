import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { encodeCursor, decodeCursor } from "../../lib/pagination.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { emailAdapter } from "../../lib/adapters.js";
import { emailHeading, emailLayout, emailMuted, emailParagraph } from "../../lib/email-templates.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import { RENTER_DOC_KINDS, type RenterDocKind } from "../customer-account/schemas.js";
import { renterVerificationOf } from "../customer-account/service.js";
import type { DocumentRow } from "../merchant/db-types.js";

/**
 * The renter document review queue. Unlike the Merchants lens (a
 * directory over decisions made in admin-vehicles), this module IS the
 * decision path - `decideRenterDocument` is what `customer-bookings`'
 * `documents_required` gate and `completeHandover`'s pickup gate both
 * ultimately key off, and what `getHirerHistory`'s `id_verified` reads.
 */

export interface AdminCtx {
  adminId: string;
  adminName: string;
  ip: string | null;
  requestId: string | null;
}

const DOC_LABEL: Record<RenterDocKind, string> = {
  national_id: "National ID",
  driving_licence: "Driving licence",
};

let storageAdapter: ReturnType<typeof createStorageAdapter> | null = null;
function getStorageAdapter(): ReturnType<typeof createStorageAdapter> {
  storageAdapter ??= createStorageAdapter();
  return storageAdapter;
}

interface RenterAggregate {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: Date;
  docs: DocumentRow[];
  latestUploadAt: Date;
}

function statusOf(docs: DocumentRow[]): "pending" | "verified" | "rejected" {
  const byKind = new Map(docs.map((d) => [d.kind, d]));
  const states = RENTER_DOC_KINDS.map((k) => byKind.get(k)?.review_state ?? "missing");
  if (states.some((s) => s === "pending" || s === "missing")) return "pending";
  if (states.every((s) => s === "ok")) return "verified";
  return "rejected";
}

/**
 * Every renter with at least one identity document on file, loaded and
 * sorted in the service - bounded and small, the same shape the Merchants
 * lens uses, not offset paging over `documents` itself.
 */
async function loadAggregates(): Promise<RenterAggregate[]> {
  const docs = await db<DocumentRow>("documents")
    .whereIn("kind", RENTER_DOC_KINDS)
    .whereNotNull("user_id");
  if (docs.length === 0) return [];

  const userIds = [...new Set(docs.map((d) => d.user_id as string))];
  const users = await db("users").whereIn("id", userIds);
  const byUser = new Map<string, DocumentRow[]>();
  for (const d of docs) {
    const list = byUser.get(d.user_id as string) ?? [];
    list.push(d);
    byUser.set(d.user_id as string, list);
  }

  return users.map((u) => {
    const userDocs = byUser.get(u.id) ?? [];
    return {
      userId: u.id,
      name: u.full_name ?? "(no name on file)",
      email: u.email,
      phone: u.phone,
      createdAt: u.created_at,
      docs: userDocs,
      latestUploadAt: new Date(Math.max(...userDocs.map((d) => d.created_at.getTime()))),
    };
  });
}

// ---------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------

export interface ListRentersQuery {
  filter: "all" | "pending" | "verified" | "rejected";
  cursor?: string;
  limit: number;
}

export async function listRenters(query: ListRentersQuery) {
  const all = await loadAggregates();
  const withStatus = all.map((a) => ({ ...a, status: statusOf(a.docs) }));
  const filtered = query.filter === "all" ? withStatus : withStatus.filter((a) => a.status === query.filter);

  // Most-waiting-first (pending, then rejected, then verified), each
  // group newest-upload-first, tie-broken by user id - same keyset-over-
  // a-sorted-array shape as the Merchants lens.
  const rank = { pending: 2, rejected: 1, verified: 0 } as const;
  filtered.sort((a, b) => {
    if (rank[b.status] !== rank[a.status]) return rank[b.status] - rank[a.status];
    if (b.latestUploadAt.getTime() !== a.latestUploadAt.getTime()) {
      return b.latestUploadAt.getTime() - a.latestUploadAt.getTime();
    }
    return a.userId < b.userId ? 1 : -1;
  });

  let start = 0;
  if (query.cursor) {
    const decoded = decodeCursor(query.cursor);
    if (decoded && typeof decoded.v === "string") {
      const afterKey = decoded.v;
      const afterId = decoded.id;
      const idx = filtered.findIndex((a) => {
        const key = `${rank[a.status]}:${a.latestUploadAt.getTime()}`;
        return key < afterKey || (key === afterKey && a.userId < afterId);
      });
      start = idx === -1 ? filtered.length : idx;
    }
  }

  const slice = filtered.slice(start, start + query.limit + 1);
  const hasMore = slice.length > query.limit;
  const page = hasMore ? slice.slice(0, query.limit) : slice;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ v: `${rank[last.status]}:${last.latestUploadAt.getTime()}`, id: last.userId })
      : null;

  return {
    data: page.map((a) => ({
      user_id: a.userId,
      name: a.name,
      email: a.email,
      status: a.status,
      uploaded_at: a.latestUploadAt.toISOString(),
    })),
    next_cursor: nextCursor,
    has_more: hasMore,
    total: filtered.length,
  };
}

// ---------------------------------------------------------------------
// File
// ---------------------------------------------------------------------

async function requireRenter(userId: string): Promise<{
  user: { id: string; full_name: string | null; email: string; phone: string | null; created_at: Date };
  docs: DocumentRow[];
}> {
  const docs = await db<DocumentRow>("documents")
    .where({ user_id: userId })
    .whereIn("kind", RENTER_DOC_KINDS);
  if (docs.length === 0) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "renter_not_found",
      message: "No identity documents on file for that account.",
    });
  }
  const user = await db("users").where({ id: userId }).first();
  if (!user) {
    throw new ApiError({ status: 404, type: "not_found", code: "renter_not_found", message: "No such account." });
  }
  return { user, docs };
}

async function serializeFile(userId: string) {
  const { user, docs } = await requireRenter(userId);
  const verification = renterVerificationOf(docs);
  const bookingCount = await db("bookings").where({ hirer_id: userId }).count<{ count: string }[]>("* as count");

  return {
    user_id: user.id,
    name: user.full_name ?? "(no name on file)",
    email: user.email,
    phone: user.phone,
    verified: verification.verified,
    documents: RENTER_DOC_KINDS.map((kind) => {
      const doc = docs.find((d) => d.kind === kind);
      return {
        document_id: doc?.id ?? null,
        kind,
        state: doc?.review_state ?? "missing",
        original_name: doc?.original_name ?? null,
        // Only a licence carries one - it is what the reviewer checks the
        // card's printed date against (there is no OCR here).
        expires_at: doc?.expires_at ?? null,
        review_note: doc?.review_note ?? null,
        reviewed_at: doc?.reviewed_at ? doc.reviewed_at.toISOString() : null,
      };
    }),
    booking_count: Number(bookingCount[0]?.count ?? 0),
    member_since: user.created_at.toISOString(),
  };
}

export async function getRenterFile(userId: string) {
  return serializeFile(userId);
}

export async function readRenterDocument(userId: string, documentId: string) {
  const doc = await db<DocumentRow>("documents")
    .where({ id: documentId, user_id: userId })
    .whereIn("kind", RENTER_DOC_KINDS)
    .first();
  if (!doc) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "document_not_found",
      message: "That document doesn't exist on this renter's account.",
    });
  }
  const body = await getStorageAdapter()
    .getObject(doc.storage_key)
    .catch(() => {
      throw new ApiError({
        status: 404,
        type: "not_found",
        code: "document_bytes_missing",
        message: "That file is no longer stored.",
      });
    });
  return {
    body,
    contentType: doc.content_type,
    originalName: doc.original_name,
  };
}

// ---------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------

export async function decideRenterDocument(
  userId: string,
  kind: string,
  decision: "accept" | "reject",
  note: string | null,
  admin: AdminCtx,
) {
  if (!(RENTER_DOC_KINDS as readonly string[]).includes(kind)) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "not_a_reviewable_document",
      message: `"${kind}" is not a renter document.`,
      field: "kind",
    });
  }
  if (decision === "reject" && !note?.trim()) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "reason_required",
      message: "Write what the renter should read before rejecting a document.",
      field: "note",
    });
  }

  const { user, docs } = await requireRenter(userId);
  const doc = docs.find((d) => d.kind === kind);
  if (!doc) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "document_not_uploaded",
      message: "Nothing is uploaded on that line yet.",
    });
  }

  const nextState = decision === "accept" ? "ok" : "rejected";
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
      action: decision === "accept" ? "renter.document_accepted" : "renter.document_rejected",
      entityType: "document",
      entityId: doc.id,
      before: { review_state: doc.review_state },
      after: { review_state: nextState, kind, user_id: userId },
      requestId: admin.requestId,
      ip: admin.ip,
    });
  });

  // After the commit, deliberately - a renter has no in-app notification
  // channel yet (notifications.merchant_id is NOT NULL; that's Migration B
  // in docs/plans/customer-portal.md, still open), so email is the only
  // real channel. A bounced email must not lose the review decision - the
  // document row is the record, the mail is a courtesy. Same pattern the
  // payout-query email uses.
  try {
    await emailAdapter.send({
      to: user.email,
      subject:
        decision === "accept"
          ? `${DOC_LABEL[kind as RenterDocKind]} accepted`
          : `${DOC_LABEL[kind as RenterDocKind]} needs another look`,
      html: emailLayout({
        preheader:
          decision === "accept"
            ? `Your ${DOC_LABEL[kind as RenterDocKind]} is cleared.`
            : `Your ${DOC_LABEL[kind as RenterDocKind]} was not accepted.`,
        bodyHtml: [
          emailHeading(decision === "accept" ? "Document accepted" : "Document needs another look"),
          emailParagraph(
            decision === "accept"
              ? `Your ${DOC_LABEL[kind as RenterDocKind]} has been read and accepted by CRAL.`
              : `Your ${DOC_LABEL[kind as RenterDocKind]} wasn't accepted: ${note!.trim()}. Upload a new copy from your documents page.`,
          ),
          emailMuted(`Account ${user.id}`),
        ].join(""),
      }),
      text:
        decision === "accept"
          ? `Your ${DOC_LABEL[kind as RenterDocKind]} has been read and accepted by CRAL.`
          : `Your ${DOC_LABEL[kind as RenterDocKind]} wasn't accepted: ${note!.trim()}. Upload a new copy from your documents page.`,
    });
  } catch {
    // The decision already committed; a delivery failure here is not the
    // renter's problem and must not surface as one.
  }

  return serializeFile(userId);
}

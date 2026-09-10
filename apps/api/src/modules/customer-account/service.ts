import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { createStorageAdapter } from "../../adapters/storage/index.js";
import type { DocumentRow } from "../merchant/db-types.js";
import { RENTER_DOC_KINDS, type RenterDocKind } from "./schemas.js";

let storage: ReturnType<typeof createStorageAdapter> | null = null;
function getStorageAdapter() {
  if (!storage) storage = createStorageAdapter();
  return storage;
}

export interface RequestContext {
  ip: string | null;
  requestId: string | null;
}

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

interface UploadInput {
  kind: RenterDocKind;
  file: UploadedFile;
}

function buildStorageKey(userId: string, kind: RenterDocKind, name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  return `renters/${userId}/${kind}-${Date.now()}${ext}`;
}

function serializeDocument(row: DocumentRow) {
  return {
    id: row.id,
    kind: row.kind,
    original_name: row.original_name,
    size_bytes: row.size_bytes,
    content_type: row.content_type,
    // A renter's document is "PENDING REVIEW" until Ops accepts/rejects it,
    // exactly like the merchant side (DOC_STATE.pending). Nothing sets an
    // "actively reviewed" state - there's one decision, in the admin
    // renters queue (PR 7).
    review_state: row.review_state,
    review_note: row.review_note,
    uploaded_at: row.created_at,
  };
}

/** Upload (or replace) one renter document. Single slot per kind. */
export async function uploadRenterDocument(userId: string, input: UploadInput) {
  const key = buildStorageKey(userId, input.kind, input.file.originalname);
  await getStorageAdapter().putObject({
    key,
    body: input.file.buffer,
    contentType: input.file.mimetype,
  });

  const row = await db.transaction(async (trx) => {
    // Replace whatever was there - a renter has exactly one ID and one
    // licence on file. A re-upload resets the review to pending.
    await trx<DocumentRow>("documents")
      .where({ user_id: userId, kind: input.kind })
      .delete();

    const [inserted] = await trx<DocumentRow>("documents")
      .insert({
        id: generateId("document"),
        merchant_id: null,
        user_id: userId,
        vehicle_id: null,
        kind: input.kind,
        storage_key: key,
        original_name: input.file.originalname,
        size_bytes: input.file.size,
        content_type: input.file.mimetype,
        review_state: "pending",
      })
      .returning("*");
    if (!inserted) throw new Error("Failed to record document");
    return inserted;
  });

  return serializeDocument(row);
}

export async function listRenterDocuments(userId: string) {
  const rows = await db<DocumentRow>("documents")
    .where({ user_id: userId })
    .orderBy("created_at", "asc");
  return {
    data: rows.map(serializeDocument),
    verification: renterVerificationOf(rows),
  };
}

/** Stream one of the caller's own documents back. Scoped to `user_id`, so
 * another user's document id is a 404, not a 403. */
export async function readRenterDocument(userId: string, documentId: string) {
  const doc = await db<DocumentRow>("documents")
    .where({ id: documentId, user_id: userId })
    .first();
  if (!doc) {
    throw new ApiError({
      status: 404,
      type: "not_found",
      code: "document_not_found",
      message: "That document doesn't exist on your account.",
    });
  }

  const body = await getStorageAdapter()
    .getObject(doc.storage_key)
    .catch(() => {
      throw new ApiError({
        status: 404,
        type: "not_found",
        code: "document_bytes_missing",
        message: "That file is no longer stored. Upload it again.",
      });
    });

  return { body, contentType: doc.content_type, originalName: doc.original_name };
}

export interface RenterVerification {
  /** true once every required document is on file AND accepted by Ops. */
  verified: boolean;
  documents: {
    kind: RenterDocKind;
    /** "missing" (no row) | "pending" | "ok" | "rejected" | "expiring" */
    state: "missing" | DocumentRow["review_state"];
    review_note: string | null;
  }[];
  /** kinds still not accepted - what the "finish setting up" banner reads. */
  outstanding: RenterDocKind[];
}

export function renterVerificationOf(rows: DocumentRow[]): RenterVerification {
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  const documents = RENTER_DOC_KINDS.map((kind) => {
    const row = byKind.get(kind);
    return {
      kind,
      state: (row?.review_state ?? "missing") as "missing" | DocumentRow["review_state"],
      review_note: row?.review_note ?? null,
    };
  });
  const outstanding = documents.filter((d) => d.state !== "ok").map((d) => d.kind);
  return { verified: outstanding.length === 0, documents, outstanding };
}

/** For `/me` and `/auth/registration-state`. */
export async function getRenterVerification(userId: string): Promise<RenterVerification> {
  const rows = await db<DocumentRow>("documents").where({ user_id: userId });
  return renterVerificationOf(rows);
}

import { db } from "../db/client.js";
import type { Knex } from "knex";
import type { MerchantRow, VehicleRow } from "../modules/merchant/db-types.js";

/**
 * The working checklists a reviewer clicks through — one for a vehicle
 * case, one for a merchant approval. Definitions live in
 * `platform_settings` (seeded by 20260909090000, editable from Settings
 * later); a reviewer's answers live in `vehicle_review_checks` /
 * `merchant_review_checks`, one row per (entity, item).
 *
 * Checklist-first (owner's call, 2026-09-25): EVERY applicable item must
 * be answered - `pass` or `flag` - before any decision (approve, request
 * changes, reject) is allowed, and approve additionally needs zero flags.
 * `severity` is still carried in the stored definitions but no longer
 * read: there is no "must pass" tier, every item is worth a reviewer's
 * look. Flagged items feed the request-changes / reject note
 * (`changes_phrase` / `reject_phrase`).
 *
 * Two things are derived at merge time rather than stored:
 * - **stale answers**: an answer given before the document it hangs under
 *   was (re-)uploaded reads as `pending` again - the reviewer checked a
 *   different file. Re-uploads delete + insert the `documents` row, so its
 *   `created_at` is the upload moment.
 * - **skipped items**: items under a document the reviewer already sent
 *   back (`review_state = rejected`) don't need answering - the merchant
 *   has to replace that file first.
 */
export type CheckSeverity = "block" | "flag";
export type CheckResult = "pending" | "pass" | "flag";

export interface ChecklistItem {
  id: string;
  group: string;
  /**
   * The document this item hangs under (`logbook` / `national_id` /
   * `photos` / ...), or null for a standalone item. Drives the
   * per-document accordion and the "every item passed -> accept the
   * document" shortcut.
   */
  document?: string | null;
  /** Stored, no longer read (see the module comment). */
  severity: CheckSeverity;
  label: string;
  help: string;
  /** null = always applies; "company" | "chauffeured" | "rate_over:<cents>" */
  applies_when?: string | null;
  changes_phrase: string;
  reject_phrase: string;
}

export interface MergedCheck extends ChecklistItem {
  result: CheckResult;
  note: string | null;
  /** Under a rejected document - not counted toward completeness. */
  skipped: boolean;
}

interface CheckRow {
  item_id: string;
  result: CheckResult;
  note: string | null;
  checked_at: Date | null;
}

function coerceItems(raw: unknown): ChecklistItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ChecklistItem[] = [];
  for (const r of raw) {
    if (
      r &&
      typeof r === "object" &&
      typeof (r as ChecklistItem).id === "string" &&
      ((r as ChecklistItem).severity === "block" || (r as ChecklistItem).severity === "flag")
    ) {
      const it = r as ChecklistItem;
      out.push({
        id: it.id,
        group: it.group ?? "Checks",
        document: it.document ?? null,
        severity: it.severity,
        label: it.label ?? it.id,
        help: it.help ?? "",
        applies_when: it.applies_when ?? null,
        changes_phrase: it.changes_phrase ?? "",
        reject_phrase: it.reject_phrase ?? "",
      });
    }
  }
  return out.length ? out : null;
}

async function loadDefinition(key: string): Promise<ChecklistItem[]> {
  const row = await db<{ key: string; value: unknown }>("platform_settings").where({ key }).first();
  return coerceItems(row?.value) ?? [];
}

export const getVehicleChecklistDefinition = () => loadDefinition("vehicle_review.checklist");
export const getMerchantChecklistDefinition = () => loadDefinition("merchant_approval.checklist");

// ---------------------------------------------------------------------
// applies_when
// ---------------------------------------------------------------------

export function vehicleApplies(item: ChecklistItem, vehicle: VehicleRow): boolean {
  const w = item.applies_when;
  if (!w) return true;
  if (w === "chauffeured") return vehicle.chauffeured === true;
  if (w.startsWith("rate_over:")) {
    const cents = Number(w.slice("rate_over:".length));
    return Number.isFinite(cents) && (vehicle.daily_rate_amount ?? 0) >= cents;
  }
  return true; // unknown predicate -> don't hide the item
}

export function merchantApplies(item: ChecklistItem, merchant: MerchantRow): boolean {
  const w = item.applies_when;
  if (!w) return true;
  if (w === "company") return merchant.owner_type === "company";
  return true;
}

// ---------------------------------------------------------------------
// document context (stale answers, skipped items)
// ---------------------------------------------------------------------

/**
 * Per-document context for a merge: when each document's current file was
 * uploaded (answers older than that are stale) and which documents are
 * rejected (their items are skipped). Keyed by the item's `document`.
 */
export interface ChecklistDocContext {
  uploadedAt: Map<string, Date>;
  rejected: Set<string>;
}

const EMPTY_DOC_CONTEXT: ChecklistDocContext = { uploadedAt: new Map(), rejected: new Set() };

export type DocForContext = { kind: string; created_at: Date; review_state: string };

/**
 * Build the merge context from the documents on file. Photo rows fold into
 * the `photos` key (newest upload wins), so re-shot photos re-open the
 * photo checks too.
 */
export function docContextFrom(docs: DocForContext[]): ChecklistDocContext {
  const uploadedAt = new Map<string, Date>();
  const rejected = new Set<string>();
  for (const d of docs) {
    const isPhoto = d.kind === "vehicle_photo";
    const key = isPhoto ? "photos" : d.kind;
    const prev = uploadedAt.get(key);
    if (!prev || d.created_at > prev) uploadedAt.set(key, d.created_at);
    if (!isPhoto && d.review_state === "rejected") rejected.add(key);
  }
  return { uploadedAt, rejected };
}

// ---------------------------------------------------------------------
// merge + evaluate
// ---------------------------------------------------------------------

async function loadRows(table: string, column: string, entityId: string): Promise<Map<string, CheckRow>> {
  const rows = await db<CheckRow>(table)
    .where({ [column]: entityId })
    .select("item_id", "result", "note", "checked_at");
  return new Map(rows.map((r) => [r.item_id, r]));
}

export function mergeChecklist(
  items: ChecklistItem[],
  rows: Map<string, CheckRow>,
  ctx: ChecklistDocContext = EMPTY_DOC_CONTEXT,
): MergedCheck[] {
  return items.map((item) => {
    const row = rows.get(item.id);
    const doc = item.document ?? null;
    const uploaded = doc ? ctx.uploadedAt.get(doc) : undefined;
    const stale =
      !!row && row.result !== "pending" && !!uploaded && !!row.checked_at && row.checked_at < uploaded;
    return {
      ...item,
      result: stale ? "pending" : (row?.result ?? "pending"),
      note: stale ? null : (row?.note ?? null),
      skipped: !!doc && ctx.rejected.has(doc),
    };
  });
}

/** Items that still need an answer (skipped ones excluded) - these gate every decision. */
export function unanswered(merged: MergedCheck[]): MergedCheck[] {
  return merged.filter((m) => !m.skipped && m.result === "pending");
}

/** Answered-but-flagged items (skipped ones excluded) - these block "Approve". */
export function flaggedItems(merged: MergedCheck[]): MergedCheck[] {
  return merged.filter((m) => !m.skipped && m.result === "flag");
}

/**
 * The note a request-changes / reject modal opens pre-filled with: one
 * bullet per flagged item, its own phrase plus any per-row note the
 * reviewer typed. Composed here so the two callers (and a future test)
 * agree; the client may still edit it freely.
 */
export function noteFromChecklist(merged: MergedCheck[], mode: "changes" | "reject"): string {
  const lines: string[] = [];
  for (const m of flaggedItems(merged)) {
    const phrase = mode === "reject" ? m.reject_phrase || m.changes_phrase : m.changes_phrase;
    const own = m.note?.trim();
    if (phrase || own) lines.push(`- ${[phrase, own].filter(Boolean).join(" ")}`.trimEnd());
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------
// public: build the case/file checklist blocks
// ---------------------------------------------------------------------

export interface ChecklistBlock {
  items: Array<{
    id: string;
    group: string;
    document: string | null;
    label: string;
    help: string;
    result: CheckResult;
    note: string | null;
    skipped: boolean;
  }>;
  /** Answered items, skipped ones excluded. */
  checked: number;
  /** Items that need an answer, skipped ones excluded. */
  total: number;
  flagged: number;
  /** total - checked. */
  outstanding: number;
  /** Every item answered - the gate for any decision. */
  complete: boolean;
  /**
   * What a request-changes / reject modal opens pre-filled with, built
   * from the flagged items. Composed here so the gate and the note agree;
   * the reviewer edits it freely before sending.
   */
  suggested_note: { changes: string; reject: string };
}

export function toBlock(merged: MergedCheck[]): ChecklistBlock {
  const live = merged.filter((m) => !m.skipped);
  const outstanding = unanswered(merged).length;
  return {
    items: merged.map((m) => ({
      id: m.id,
      group: m.group,
      document: m.document ?? null,
      label: m.label,
      help: m.help,
      result: m.result,
      note: m.note,
      skipped: m.skipped,
    })),
    checked: live.length - outstanding,
    total: live.length,
    flagged: flaggedItems(merged).length,
    outstanding,
    complete: outstanding === 0,
    suggested_note: {
      changes: noteFromChecklist(merged, "changes"),
      reject: noteFromChecklist(merged, "reject"),
    },
  };
}

/** The case's checklist. Pass the vehicle's documents when already loaded; otherwise they're read here. */
export async function vehicleChecklist(
  vehicle: VehicleRow,
  docs?: DocForContext[],
): Promise<{ merged: MergedCheck[]; block: ChecklistBlock }> {
  const [def, rows, vehicleDocs] = await Promise.all([
    getVehicleChecklistDefinition(),
    loadRows("vehicle_review_checks", "vehicle_id", vehicle.id),
    docs ??
      db("documents")
        .where({ vehicle_id: vehicle.id })
        .select<DocForContext[]>("kind", "created_at", "review_state"),
  ]);
  const merged = mergeChecklist(
    def.filter((it) => vehicleApplies(it, vehicle)),
    rows,
    docContextFrom(vehicleDocs),
  );
  return { merged, block: toBlock(merged) };
}

/** The merchant file's checklist. Pass the account documents when already loaded. */
export async function merchantChecklist(
  merchant: MerchantRow,
  docs?: DocForContext[],
): Promise<{ merged: MergedCheck[]; block: ChecklistBlock }> {
  const [def, rows, ownerDocs] = await Promise.all([
    getMerchantChecklistDefinition(),
    loadRows("merchant_review_checks", "merchant_id", merchant.id),
    docs ??
      db("documents")
        .where({ merchant_id: merchant.id, vehicle_id: null })
        .select<DocForContext[]>("kind", "created_at", "review_state"),
  ]);
  const merged = mergeChecklist(
    def.filter((it) => merchantApplies(it, merchant)),
    rows,
    docContextFrom(ownerDocs),
  );
  return { merged, block: toBlock(merged) };
}

/** Upsert one answer. Validates the item is in the (applicable) definition. */
export async function setVehicleCheck(
  vehicle: VehicleRow,
  itemId: string,
  result: CheckResult,
  note: string | null,
  adminId: string,
): Promise<void> {
  const def = (await getVehicleChecklistDefinition()).filter((it) => vehicleApplies(it, vehicle));
  if (!def.some((it) => it.id === itemId)) throw new UnknownChecklistItem(itemId);
  await upsertCheck("vehicle_review_checks", { vehicle_id: vehicle.id }, itemId, result, note, adminId);
}

export async function setMerchantCheck(
  merchant: MerchantRow,
  itemId: string,
  result: CheckResult,
  note: string | null,
  adminId: string,
): Promise<void> {
  const def = (await getMerchantChecklistDefinition()).filter((it) => merchantApplies(it, merchant));
  if (!def.some((it) => it.id === itemId)) throw new UnknownChecklistItem(itemId);
  await upsertCheck("merchant_review_checks", { merchant_id: merchant.id }, itemId, result, note, adminId);
}

export class UnknownChecklistItem extends Error {
  constructor(id: string) {
    super(`No checklist item "${id}"`);
  }
}

async function upsertCheck(
  table: string,
  scope: Record<string, string>,
  itemId: string,
  result: CheckResult,
  note: string | null,
  adminId: string,
): Promise<void> {
  const now = new Date();
  const pkCols = [...Object.keys(scope), "item_id"];
  await db(table)
    .insert({
      ...scope,
      item_id: itemId,
      result,
      note,
      checked_by: adminId,
      checked_at: result === "pending" ? null : now,
      created_at: now,
      updated_at: now,
    })
    .onConflict(pkCols)
    .merge({ result, note, checked_by: adminId, checked_at: result === "pending" ? null : now, updated_at: now });
}

/**
 * Clear every answer under one document - "Undo" on a document decision
 * puts the reviewer back at the start of that document's checklist.
 */
export async function resetDocumentChecks(
  trx: Knex.Transaction,
  table: "vehicle_review_checks" | "merchant_review_checks",
  scope: Record<string, string>,
  itemIds: string[],
): Promise<void> {
  if (!itemIds.length) return;
  await trx(table).where(scope).whereIn("item_id", itemIds).delete();
}

/** A compact {id: result} map for the decision's audit-log `after` payload. */
export function checklistSnapshot(merged: MergedCheck[]): Record<string, CheckResult> {
  return Object.fromEntries(merged.map((m) => [m.id, m.result]));
}

/** Group a merged checklist by its items' `document` (null -> "other"). */
export function splitByDocument(merged: MergedCheck[]): Map<string, MergedCheck[]> {
  const out = new Map<string, MergedCheck[]>();
  for (const m of merged) {
    const key = m.document ?? "other";
    const list = out.get(key) ?? [];
    list.push(m);
    out.set(key, list);
  }
  return out;
}

/**
 * Uploaded documents that have no applicable checks of their own (e.g. the
 * tracker certificate on a car under the `rate_over` line) and that nobody
 * has decided yet. Nothing can auto-accept them, so each one counts as an
 * unanswered check: the reviewer accepts it or asks for a new upload
 * before any case-level decision.
 */
export function undecidedUncheckedDocs(
  docs: Array<{ kind: string; review_state: string }>,
  merged: MergedCheck[],
  kinds: string[],
): string[] {
  return kinds.filter((kind) => {
    const doc = docs.find((d) => d.kind === kind);
    return !!doc && doc.review_state === "pending" && !merged.some((m) => m.document === kind);
  });
}

/**
 * Where one document's checklist stands: `none` (no items hang under it),
 * `incomplete`, `flagged` (all answered, at least one flag) or `passed`
 * (every item passed - the trigger for auto-accepting the document).
 */
export function documentChecklistState(
  merged: MergedCheck[],
  document: string,
): "none" | "incomplete" | "flagged" | "passed" {
  const items = merged.filter((m) => m.document === document);
  if (!items.length) return "none";
  if (items.some((m) => m.result === "pending")) return "incomplete";
  return items.some((m) => m.result === "flag") ? "flagged" : "passed";
}

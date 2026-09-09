import { db } from "../db/client.js";
import type { MerchantRow, VehicleRow } from "../modules/merchant/db-types.js";

/**
 * The working checklists a reviewer clicks through — one for a vehicle
 * case, one for a merchant approval. Definitions live in
 * `platform_settings` (seeded by 20260909090000, editable from Settings
 * later); a reviewer's answers live in `vehicle_review_checks` /
 * `merchant_review_checks`, one row per (entity, item).
 *
 * A `block` item must be `pass` before "Approve" is allowed. A `flag`
 * never blocks; both `flag`ged items and still-`pending` blockers feed the
 * request-changes / reject note (`changes_phrase` / `reject_phrase`).
 */
export type CheckSeverity = "block" | "flag";
export type CheckResult = "pending" | "pass" | "flag";

export interface ChecklistItem {
  id: string;
  group: string;
  /**
   * The document this item hangs under on the vehicle case
   * (`logbook` / `comprehensive_insurance` / `tracker_certificate` /
   * `photos`), or null for a standalone item. Drives the per-document
   * accordion and the "all block items passed -> accept the document"
   * shortcut.
   */
  document?: string | null;
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
}

interface CheckRow {
  item_id: string;
  result: CheckResult;
  note: string | null;
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
// merge + evaluate
// ---------------------------------------------------------------------

async function loadRows(table: string, column: string, entityId: string): Promise<Map<string, CheckRow>> {
  const rows = await db<CheckRow>(table).where({ [column]: entityId });
  return new Map(rows.map((r) => [r.item_id, r]));
}

export function mergeChecklist(items: ChecklistItem[], rows: Map<string, CheckRow>): MergedCheck[] {
  return items.map((item) => {
    const row = rows.get(item.id);
    return {
      ...item,
      result: row?.result ?? "pending",
      note: row?.note ?? null,
    };
  });
}

/** The `block` items that aren't `pass` yet — these disable "Approve". */
export function blockersOutstanding(merged: MergedCheck[]): MergedCheck[] {
  return merged.filter((m) => m.severity === "block" && m.result !== "pass");
}

/**
 * The note a request-changes / reject modal opens pre-filled with: one
 * bullet per flagged item or unresolved blocker, its own phrase plus any
 * per-row note the reviewer typed. Composed here so the two callers (and a
 * future test) agree; the client may still edit it freely.
 */
export function noteFromChecklist(merged: MergedCheck[], mode: "changes" | "reject"): string {
  const lines: string[] = [];
  for (const m of merged) {
    const failing = m.result === "flag" || (m.severity === "block" && m.result !== "pass");
    if (!failing) continue;
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
    severity: CheckSeverity;
    label: string;
    help: string;
    result: CheckResult;
    note: string | null;
  }>;
  checked: number;
  total: number;
  flagged: number;
  blockers_outstanding: number;
  /**
   * What a request-changes / reject modal opens pre-filled with, built
   * from the flagged items and unresolved blockers. Composed here so the
   * gate and the note agree; the reviewer edits it freely before sending.
   */
  suggested_note: { changes: string; reject: string };
}

export function toBlock(merged: MergedCheck[]): ChecklistBlock {
  return {
    items: merged.map((m) => ({
      id: m.id,
      group: m.group,
      document: m.document ?? null,
      severity: m.severity,
      label: m.label,
      help: m.help,
      result: m.result,
      note: m.note,
    })),
    checked: merged.filter((m) => m.result !== "pending").length,
    total: merged.length,
    flagged: merged.filter((m) => m.result === "flag").length,
    blockers_outstanding: blockersOutstanding(merged).length,
    suggested_note: {
      changes: noteFromChecklist(merged, "changes"),
      reject: noteFromChecklist(merged, "reject"),
    },
  };
}

export async function vehicleChecklist(vehicle: VehicleRow): Promise<{ merged: MergedCheck[]; block: ChecklistBlock }> {
  const def = (await getVehicleChecklistDefinition()).filter((it) => vehicleApplies(it, vehicle));
  const rows = await loadRows("vehicle_review_checks", "vehicle_id", vehicle.id);
  const merged = mergeChecklist(def, rows);
  return { merged, block: toBlock(merged) };
}

export async function merchantChecklist(merchant: MerchantRow): Promise<{ merged: MergedCheck[]; block: ChecklistBlock }> {
  const def = (await getMerchantChecklistDefinition()).filter((it) => merchantApplies(it, merchant));
  const rows = await loadRows("merchant_review_checks", "merchant_id", merchant.id);
  const merged = mergeChecklist(def, rows);
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
 * True when `document` has at least one `block` item and every one of them
 * is `pass` — the trigger for auto-accepting that document on the case.
 */
export function documentChecksAllPass(merged: MergedCheck[], document: string): boolean {
  const blockers = merged.filter((m) => m.document === document && m.severity === "block");
  return blockers.length > 0 && blockers.every((m) => m.result === "pass");
}

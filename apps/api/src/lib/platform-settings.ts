import { db } from "../db/client.js";

/**
 * Typed reader over the `platform_settings` key/value table (migration
 * `20260907100000`). Seeded with the current behaviour as defaults; the
 * admin Settings → Review rules screen edits these later. No cache — these
 * are read once per review action, not per request in a hot path, and a
 * cache would need invalidation the moment Settings can write them.
 */

export type AutoCheckId = "plate_format" | "duplicate_plate" | "insurance_expiry";

export interface VehicleReviewSettings {
  /** The two-working-day promise. Drives the queue's SLA colouring. */
  slaDays: number;
  /** Which advisory checks run on a submission. */
  autoChecks: AutoCheckId[];
  /**
   * Every document kind a *car* must have Accepted before it goes live -
   * the three per-vehicle docs. The merchant's own documents are a
   * separate gate (`getMerchantApprovalDocs`), cleared once per merchant.
   */
  requiredDocumentKinds: string[];
}

const DEFAULTS: VehicleReviewSettings = {
  slaDays: 2,
  autoChecks: ["plate_format", "duplicate_plate", "insurance_expiry"],
  requiredDocumentKinds: ["logbook", "comprehensive_insurance", "tracker_certificate"],
};

/** The account / business documents required to approve a merchant, by entity type. */
export interface MerchantApprovalDocs {
  individual: string[];
  company: string[];
}

const MERCHANT_DOC_DEFAULTS: MerchantApprovalDocs = {
  individual: ["national_id", "kra_pin"],
  company: ["national_id", "kra_pin", "certificate_of_incorporation", "company_kra_pin", "cr12"],
};

export async function getMerchantApprovalDocs(): Promise<MerchantApprovalDocs> {
  const row = await db<{ key: string; value: unknown }>("platform_settings")
    .where({ key: "merchant_approval.required_document_kinds" })
    .first();
  const v = row?.value as Partial<MerchantApprovalDocs> | undefined;
  const ok = (a: unknown): a is string[] => Array.isArray(a) && a.every((x) => typeof x === "string");
  return {
    individual: ok(v?.individual) ? v.individual : MERCHANT_DOC_DEFAULTS.individual,
    company: ok(v?.company) ? v.company : MERCHANT_DOC_DEFAULTS.company,
  };
}

export function merchantApprovalDocsFor(ownerType: string, docs: MerchantApprovalDocs): string[] {
  return ownerType === "company" ? docs.company : docs.individual;
}

export async function getVehicleReviewSettings(): Promise<VehicleReviewSettings> {
  const rows = await db<{ key: string; value: unknown }>("platform_settings").whereIn("key", [
    "vehicle_review.sla_days",
    "vehicle_review.auto_checks",
    "vehicle_review.required_document_kinds",
  ]);
  const by = new Map(rows.map((r) => [r.key, r.value]));

  const slaRaw = by.get("vehicle_review.sla_days");
  const checksRaw = by.get("vehicle_review.auto_checks");
  const docsRaw = by.get("vehicle_review.required_document_kinds");

  return {
    slaDays: typeof slaRaw === "number" && slaRaw > 0 ? slaRaw : DEFAULTS.slaDays,
    autoChecks: Array.isArray(checksRaw)
      ? (checksRaw.filter((c): c is AutoCheckId =>
          DEFAULTS.autoChecks.includes(c as AutoCheckId),
        ) as AutoCheckId[])
      : DEFAULTS.autoChecks,
    requiredDocumentKinds:
      Array.isArray(docsRaw) && docsRaw.every((d) => typeof d === "string")
        ? (docsRaw as string[])
        : DEFAULTS.requiredDocumentKinds,
  };
}

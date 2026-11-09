import type { Knex } from "knex";

/**
 * Checklist-first review (owner's call, 2026-09-25).
 *
 *  - `merchant_approval.checklist` items gain a `document`, so the merchant
 *    file renders each business document with its own checklist underneath
 *    and auto-accepts a document once every item under it passes - the
 *    same shape the vehicle case got in 20260909090000. Items that describe
 *    the account as a whole (address, consistency, payout name) stay
 *    `document: null` and render as a "Business checks" section. Patched by
 *    item id so any edits made to the stored definition since are kept.
 *  - `merchants.review_changes_requested_at` + `merchants.review_note`: the
 *    business-level "Request changes" decision. Cleared on approve. There is
 *    deliberately no business-level reject - that is account suspension, a
 *    bigger step with its own slice.
 */
const MERCHANT_ITEM_DOCUMENT: Record<string, string> = {
  id_scan: "national_id",
  id_name: "national_id",
  kra_name: "kra_pin",
  kra_match: "kra_pin",
  co_cert: "certificate_of_incorporation",
  co_name: "certificate_of_incorporation",
  co_regno: "certificate_of_incorporation",
  co_kra: "company_kra_pin",
  cr12_age: "cr12",
  cr12_dir: "cr12",
  co_status: "cr12",
};

async function patchMerchantChecklist(knex: Knex, withDocuments: boolean): Promise<void> {
  const row = await knex("platform_settings").where({ key: "merchant_approval.checklist" }).first();
  if (!row) return;
  const items = (typeof row.value === "string" ? JSON.parse(row.value) : row.value) as Array<
    Record<string, unknown>
  >;
  if (!Array.isArray(items)) return;
  const next = items.map((it) => {
    const copy = { ...it };
    if (withDocuments) copy.document = MERCHANT_ITEM_DOCUMENT[String(it.id)] ?? null;
    else delete copy.document;
    return copy;
  });
  await knex("platform_settings")
    .where({ key: "merchant_approval.checklist" })
    .update({ value: JSON.stringify(next), updated_at: knex.fn.now() });
}

export async function up(knex: Knex): Promise<void> {
  await patchMerchantChecklist(knex, true);
  await knex.schema.alterTable("merchants", (table) => {
    table.timestamp("review_changes_requested_at", { useTz: true }).nullable();
    table.text("review_note").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("merchants", (table) => {
    table.dropColumn("review_note");
    table.dropColumn("review_changes_requested_at");
  });
  await patchMerchantChecklist(knex, false);
}

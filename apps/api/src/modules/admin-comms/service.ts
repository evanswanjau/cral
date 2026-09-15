import { ApiError, type PaginatedResult } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { nairobiMonthStartUtc } from "../../lib/dates.js";
import { NOTIFICATION_CATEGORIES } from "../../lib/notifications.js";
import { EXPIRING_WITHIN_DAYS } from "../vehicles/service.js";
import { enqueueCommsRun } from "../../jobs/comms-bulk-send.js";
import type { MerchantRow } from "../merchant/db-types.js";
import type {
  AudienceKey,
  CommsChannel,
  CommsRecipient,
  CommsRunRow,
  CommsTemplateRow,
} from "./db-types.js";

export interface AdminCtx {
  adminId: string;
  ip: string | null;
  requestId: string | null;
}

const SMS_COST_PER_SEGMENT_KES = 0.8;
const SMS_SEGMENT_LEN = 160;

// ---------------------------------------------------------------------
// Audiences — every count is live, against the same tables the rest of
// the console reads. "verified" / "pending" both key off
// merchants.approved_at, same as the ✓ VERIFIED chip everywhere else.
// ---------------------------------------------------------------------

const AUDIENCE_LABEL: Record<AudienceKey, string> = {
  all: "All merchants",
  verified: "Verified merchants only",
  pending: "Merchants with a pending review",
  companies: "Registered companies",
  expiring: "Insurance expiring in 30 days",
  single: "A single merchant",
};

/** merchant_id list for one audience (excluding `single`, resolved separately). */
async function resolveAudienceMerchantIds(key: Exclude<AudienceKey, "single">): Promise<string[]> {
  if (key === "all") {
    return (await db<MerchantRow>("merchants").select("id")).map((m) => m.id);
  }
  if (key === "verified") {
    return (await db<MerchantRow>("merchants").whereNotNull("approved_at").select("id")).map((m) => m.id);
  }
  if (key === "pending") {
    return (await db<MerchantRow>("merchants").whereNull("approved_at").select("id")).map((m) => m.id);
  }
  if (key === "companies") {
    return (await db<MerchantRow>("merchants").where({ owner_type: "company" }).select("id")).map((m) => m.id);
  }
  // expiring: at least one vehicle whose comprehensive_insurance document
  // expires within EXPIRING_WITHIN_DAYS - the same window the Dashboard's
  // expiring-document card and the expiry-notification sweep both use.
  const rows = await db("documents as d")
    .join("vehicles as v", "v.id", "d.vehicle_id")
    .where("d.kind", "comprehensive_insurance")
    .whereNotNull("d.expires_at")
    .andWhere("d.expires_at", "<=", db.raw(`now() + interval '${EXPIRING_WITHIN_DAYS} days'`))
    .distinct("v.merchant_id as merchant_id");
  return rows.map((r) => r.merchant_id as string);
}

async function resolveRecipients(merchantIds: string[]): Promise<CommsRecipient[]> {
  if (merchantIds.length === 0) return [];
  const rows = await db("merchants as m")
    .join("users as u", "u.id", "m.user_id")
    .whereIn("m.id", merchantIds)
    .andWhere("m.sms_opt_out", false)
    .select<
      { merchant_id: string; phone: string | null; phone_verified: boolean; email: string | null }[]
    >("m.id as merchant_id", "u.phone", "u.phone_verified", "u.email");
  return rows.map((r) => ({
    merchantId: r.merchant_id,
    phone: r.phone,
    phoneVerified: r.phone_verified,
    email: r.email,
  }));
}

interface AudienceRow {
  key: AudienceKey;
  label: string;
  count: number;
  sms_opt_out_count: number;
  note: string;
}

export async function listAudiences() {
  const keys: Exclude<AudienceKey, "single">[] = ["all", "verified", "pending", "companies", "expiring"];
  const data: AudienceRow[] = await Promise.all(
    keys.map(async (key) => {
      const ids = await resolveAudienceMerchantIds(key);
      const optOutCount = ids.length
        ? Number(
            (
              await db<MerchantRow>("merchants")
                .whereIn("id", ids)
                .andWhere("sms_opt_out", true)
                .count<{ count: string }[]>("* as count")
            )[0]?.count ?? 0,
          )
        : 0;
      return {
        key,
        label: AUDIENCE_LABEL[key],
        count: ids.length - optOutCount,
        sms_opt_out_count: optOutCount,
        note: optOutCount ? `${optOutCount} opted out of SMS` : "none opted out of SMS",
      };
    }),
  );
  data.push({
    key: "single",
    label: AUDIENCE_LABEL.single,
    count: 1,
    sms_opt_out_count: 0,
    note: "pick them on the next step",
  });
  return { data };
}

// ---------------------------------------------------------------------
// Templates — "automatic" rows are read-only, derived from the real
// notification categories (lib/notifications.ts) rather than a fabricated
// four-row list: what fires, how it's labelled, and real usage stats off
// the notifications table. "manual" rows are the ones an admin writes.
// ---------------------------------------------------------------------

function serializeTemplate(t: CommsTemplateRow) {
  return {
    id: t.id,
    label: t.label,
    channel: t.channel,
    subject: t.subject,
    body: t.body,
    trigger: "manual" as const,
    use_count: t.use_count,
    last_used_at: t.last_used_at ? t.last_used_at.toISOString() : null,
  };
}

export async function listTemplates() {
  const categories = Object.keys(NOTIFICATION_CATEGORIES) as Array<keyof typeof NOTIFICATION_CATEGORIES>;
  const usage = await db("notifications")
    .whereIn("category", categories)
    .select("category")
    .count<{ category: string; count: string; last: string | null }[]>("* as count")
    .max("occurred_at as last")
    .groupBy("category");
  const usageByCategory = new Map(usage.map((u) => [u.category, u]));

  const automatic = categories.map((category) => {
    const meta = NOTIFICATION_CATEGORIES[category];
    const u = usageByCategory.get(category);
    const channel: CommsChannel = meta.default.sms && meta.default.email ? "both" : meta.default.sms ? "sms" : "email";
    return {
      id: null,
      label: meta.label,
      channel,
      subject: meta.label,
      body: meta.body,
      trigger: "automatic" as const,
      use_count: Number(u?.count ?? 0),
      last_used_at: u?.last ? new Date(u.last as unknown as string).toISOString() : null,
    };
  });

  const manual = await db<CommsTemplateRow>("comms_templates").orderBy("created_at", "desc");
  return { data: [...automatic, ...manual.map(serializeTemplate)] };
}

export async function createTemplate(
  input: { label: string; channel: CommsChannel; subject?: string | undefined; body: string },
  ctx: AdminCtx,
) {
  const id = generateId("commsTemplate");
  const [row] = await db<CommsTemplateRow>("comms_templates")
    .insert({
      id,
      label: input.label,
      channel: input.channel,
      subject: input.channel === "sms" ? null : (input.subject ?? null),
      body: input.body,
      created_by: ctx.adminId,
    })
    .returning("*");
  return serializeTemplate(row!);
}

// ---------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------

function segmentsFor(body: string): number {
  return Math.max(1, Math.ceil(body.length / SMS_SEGMENT_LEN));
}

export async function sendComms(
  input: {
    audience: AudienceKey;
    merchant_id?: string | undefined;
    channel: CommsChannel;
    subject?: string | undefined;
    body: string;
    template_id?: string | undefined;
  },
  ctx: AdminCtx,
) {
  let merchantIds: string[];
  if (input.audience === "single") {
    if (!input.merchant_id) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "merchant_id_required",
        message: "Pick which merchant this goes to.",
        field: "merchant_id",
      });
    }
    const merchant = await db<MerchantRow>("merchants").where({ id: input.merchant_id }).first();
    if (!merchant) {
      throw new ApiError({ status: 404, type: "not_found", code: "merchant_not_found", message: "That merchant doesn't exist." });
    }
    merchantIds = [merchant.id];
  } else {
    merchantIds = await resolveAudienceMerchantIds(input.audience);
  }

  const recipients = await resolveRecipients(merchantIds);
  const eligible = recipients.filter((r) =>
    input.channel === "sms"
      ? r.phone && r.phoneVerified
      : input.channel === "email"
        ? Boolean(r.email)
        : (r.phone && r.phoneVerified) || r.email,
  );
  if (eligible.length === 0) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "empty_audience",
      message: "Nobody in that audience can be reached on this channel.",
    });
  }

  const id = generateId("commsRun");
  await db.transaction(async (trx) => {
    await trx<CommsRunRow>("comms_runs").insert({
      id,
      audience_key: input.audience,
      channel: input.channel,
      subject: input.subject ?? null,
      body: input.body,
      template_id: input.template_id ?? null,
      recipient_count: eligible.length,
      sent_by: ctx.adminId,
    });
    if (input.template_id) {
      await trx("comms_templates")
        .where({ id: input.template_id })
        .update({ use_count: db.raw("use_count + 1"), last_used_at: new Date(), updated_at: new Date() });
    }
    await writeAuditEntry(trx, {
      actorId: ctx.adminId,
      actorType: "admin",
      action: "comms.sent",
      entityType: "comms_run",
      entityId: id,
      after: { audience: input.audience, channel: input.channel, recipient_count: eligible.length },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  await enqueueCommsRun(id, eligible, { channel: input.channel, subject: input.subject ?? null, body: input.body });

  return serializeRun((await db<CommsRunRow>("comms_runs").where({ id }).first())!, ctx.adminId);
}

function serializeRun(r: CommsRunRow, sentByName: string) {
  return {
    id: r.id,
    audience_key: r.audience_key,
    audience_label: AUDIENCE_LABEL[r.audience_key],
    channel: r.channel,
    subject: r.subject,
    body: r.body,
    recipient_count: r.recipient_count,
    sent_count: r.sent_count,
    failed_count: r.failed_count,
    status: r.status,
    sent_by_name: sentByName,
    created_at: r.created_at.toISOString(),
    completed_at: r.completed_at ? r.completed_at.toISOString() : null,
  };
}

// ---------------------------------------------------------------------
// Runs / logs
// ---------------------------------------------------------------------

export async function listRuns(cursor: string | undefined, limit: number): Promise<PaginatedResult<unknown> & { stats: unknown }> {
  const rows = (await applyCursor(db<CommsRunRow>("comms_runs"), {
    sortColumn: "created_at",
    direction: "desc",
    limit,
    ...(cursor ? { cursor } : {}),
  })) as CommsRunRow[];
  const page = toPaginatedResult(rows, limit, "created_at");

  const adminIds = [...new Set(page.data.map((r) => r.sent_by))];
  const admins = adminIds.length ? await db("admin_users").whereIn("id", adminIds).select("id", "full_name") : [];
  const nameById = new Map(admins.map((a) => [a.id as string, a.full_name as string]));

  const monthStart = nairobiMonthStartUtc(new Date());
  const monthRuns = await db<CommsRunRow>("comms_runs").where("created_at", ">=", monthStart);
  const sentThisMonth = monthRuns.reduce((sum, r) => sum + r.recipient_count, 0);
  const totalAttempted = monthRuns.reduce((sum, r) => sum + r.sent_count + r.failed_count, 0);
  const totalSent = monthRuns.reduce((sum, r) => sum + r.sent_count, 0);
  const smsSegments = monthRuns
    .filter((r) => r.channel !== "email")
    .reduce((sum, r) => sum + r.recipient_count * segmentsFor(r.body), 0);
  const optOuts = Number(
    (await db<MerchantRow>("merchants").where("sms_opt_out", true).count<{ count: string }[]>("* as count"))[0]
      ?.count ?? 0,
  );

  return {
    data: page.data.map((r) => serializeRun(r, nameById.get(r.sent_by) ?? "—")),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
    stats: {
      sent_this_month: sentThisMonth,
      delivery_rate: totalAttempted ? Math.round((totalSent / totalAttempted) * 1000) / 1000 : null,
      sms_spend_kes: Math.round(smsSegments * SMS_COST_PER_SEGMENT_KES),
      opt_outs: optOuts,
    },
  };
}

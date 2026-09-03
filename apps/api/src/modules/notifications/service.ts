import { ApiError, type PaginatedResult } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_ORDER,
  NOTIFICATION_KIND,
  categoryLocksSms,
  kindForCategory,
  notify,
} from "../../lib/notifications.js";
import { getOrCreateMerchant, type RequestContext } from "../merchant/service.js";
import { EXPIRING_WITHIN_DAYS } from "../vehicles/service.js";
import type { VehicleRow } from "../merchant/db-types.js";
import type {
  NotificationCategory,
  NotificationKind,
  NotificationPreferenceRow,
  NotificationRow,
} from "./db-types.js";
import type { ListNotificationsQuery, NotificationFilter, UpdateNotificationPreferencesInput } from "./schemas.js";

const RETENTION_DAYS = 90;

/** Filter -> the feed `kind` it narrows to (`all` / `unread` narrow differently). */
const FILTER_KIND: Record<Exclude<NotificationFilter, "all" | "unread">, NotificationKind> = {
  bookings: "hire",
  money: "money",
  documents: "doc",
  ratings: "rate",
};

function notFound(): never {
  throw new ApiError({
    status: 404,
    type: "not_found",
    code: "notification_not_found",
    message: "That notification isn't on your account.",
  });
}

// ---------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------

/** The row's "{{cta}} ›" link — label and a client-relative href. */
function ctaFor(row: NotificationRow): { cta: string; cta_href: string } | null {
  if (row.category === "rating" && row.subject_type === "booking" && row.subject_id) {
    return { cta: "Rate back", cta_href: `/bookings/${row.subject_id}` };
  }
  switch (row.subject_type) {
    case "booking":
      return row.subject_id ? { cta: "Open booking", cta_href: `/bookings/${row.subject_id}` } : null;
    case "vehicle":
      return row.subject_id ? { cta: "Open vehicle", cta_href: `/vehicles/${row.subject_id}` } : null;
    case "payout_run":
      return row.subject_id ? { cta: "Open payout", cta_href: `/payouts/${row.subject_id}` } : null;
    case "merchant":
      return { cta: "Open settings", cta_href: "/settings/notifications" };
    default:
      return null;
  }
}

/**
 * Exported as `serializeNotification` so the dashboard's activity list is
 * literally the same rows the feed renders, CTA hrefs and all - not a
 * second, drifting shape for the same data.
 */
export function serialize(row: NotificationRow) {
  const kind = NOTIFICATION_KIND[row.kind];
  return {
    id: row.id,
    category: row.category,
    kind: row.kind,
    group: kind.group,
    icon: kind.icon,
    title: row.title,
    body: row.body,
    ref: row.ref,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    occurred_at: row.occurred_at.toISOString(),
    read: row.read_at !== null,
    ...(ctaFor(row) ?? {}),
  };
}

// ---------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------

async function filterCounts(merchantId: string) {
  const byKind = await db<NotificationRow>("notifications")
    .where({ merchant_id: merchantId })
    .groupBy("kind")
    .select("kind")
    .count<{ kind: NotificationKind; count: string }[]>("id as count");
  const kindCount = new Map(byKind.map((r) => [r.kind, Number(r.count)]));

  const unreadRow = await db<NotificationRow>("notifications")
    .where({ merchant_id: merchantId })
    .whereNull("read_at")
    .count<{ count: string }[]>("id as count");
  const unread = Number(unreadRow[0]?.count ?? 0);
  const all = [...kindCount.values()].reduce((sum, n) => sum + n, 0);

  return {
    all,
    unread,
    bookings: kindCount.get("hire") ?? 0,
    money: kindCount.get("money") ?? 0,
    documents: kindCount.get("doc") ?? 0,
    ratings: kindCount.get("rate") ?? 0,
  };
}

export async function listNotifications(userId: string, query: ListNotificationsQuery) {
  const merchant = await getOrCreateMerchant(userId);

  let base = db<NotificationRow>("notifications").where({ merchant_id: merchant.id });
  if (query.filter === "unread") base = base.whereNull("read_at");
  else if (query.filter !== "all") base = base.where("kind", FILTER_KIND[query.filter]);

  const rows = await applyCursor(base.select("*"), {
    sortColumn: "occurred_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const page: PaginatedResult<NotificationRow> = toPaginatedResult(rows, query.limit, "occurred_at");

  const counts = await filterCounts(merchant.id);

  // The urgent banner surfaces the first unread booking request.
  const urgentRow = await db<NotificationRow>("notifications")
    .where({ merchant_id: merchant.id, category: "booking" })
    .whereNull("read_at")
    .orderBy("occurred_at", "desc")
    .orderBy("id", "desc")
    .first();

  return {
    data: page.data.map(serialize),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
    counts,
    unread: counts.unread,
    urgent: urgentRow ? serialize(urgentRow) : null,
  };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const merchant = await getOrCreateMerchant(userId);
  const updated = await db<NotificationRow>("notifications")
    .where({ id: notificationId, merchant_id: merchant.id })
    .whereNull("read_at")
    .update({ read_at: new Date(), updated_at: new Date() });
  if (updated === 0) {
    const exists = await db<NotificationRow>("notifications")
      .where({ id: notificationId, merchant_id: merchant.id })
      .first();
    if (!exists) notFound();
  }
  return { unread: (await filterCounts(merchant.id)).unread };
}

export async function markAllNotificationsRead(userId: string) {
  const merchant = await getOrCreateMerchant(userId);
  const now = new Date();
  const updated = await db<NotificationRow>("notifications")
    .where({ merchant_id: merchant.id })
    .whereNull("read_at")
    .update({ read_at: now, updated_at: now });
  return { marked: updated, unread: 0 };
}

// ---------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------

function serializeQuietHours(merchant: {
  quiet_hours_enabled: boolean;
  quiet_from: string | null;
  quiet_until: string | null;
}) {
  return {
    enabled: Boolean(merchant.quiet_hours_enabled),
    from: merchant.quiet_from ?? "22:00",
    until: merchant.quiet_until ?? "06:30",
  };
}

export async function getNotificationPreferences(userId: string) {
  const merchant = await getOrCreateMerchant(userId);
  const rows = await db<NotificationPreferenceRow>("notification_preferences").where({ merchant_id: merchant.id });
  const byCategory = new Map(rows.map((r) => [r.category, r]));

  return {
    categories: NOTIFICATION_CATEGORY_ORDER.map((category) => {
      const meta = NOTIFICATION_CATEGORIES[category];
      const row = byCategory.get(category);
      return {
        category,
        label: meta.label,
        body: meta.body,
        kind: kindForCategory(category),
        sms: (row ? row.sms : meta.default.sms) || categoryLocksSms(category),
        email: row ? row.email : meta.default.email,
        locked: meta.locked,
      };
    }),
    quiet_hours: serializeQuietHours(merchant),
  };
}

export async function updateNotificationPreferences(
  userId: string,
  input: UpdateNotificationPreferencesInput,
  ctx: RequestContext,
) {
  const merchant = await getOrCreateMerchant(userId);

  // A locked channel arriving switched off is a client bug — the design
  // renders the toggle as visibly locked. Reject rather than coerce.
  for (const row of input.categories) {
    const meta = NOTIFICATION_CATEGORIES[row.category as NotificationCategory];
    if (meta.locked.includes("sms") && !row.sms) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "channel_locked",
        message: `"${meta.label}" always sends by SMS — that channel can't be turned off.`,
        field: `categories.${row.category}.sms`,
      });
    }
    if (meta.locked.includes("email") && !row.email) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "channel_locked",
        message: `"${meta.label}" always sends by email — that channel can't be turned off.`,
        field: `categories.${row.category}.email`,
      });
    }
  }

  await db.transaction(async (trx) => {
    // Upsert on the (merchant_id, category) unique index rather than
    // select-then-insert: two saves racing each other would otherwise turn
    // the constraint into a 500.
    for (const row of input.categories) {
      await trx("notification_preferences")
        .insert({
          id: generateId("notificationPreference"),
          merchant_id: merchant.id,
          category: row.category,
          sms: row.sms,
          email: row.email,
          updated_at: new Date(),
        })
        .onConflict(["merchant_id", "category"])
        .merge(["sms", "email", "updated_at"]);
    }

    await trx("merchants").where({ id: merchant.id }).update({
      quiet_hours_enabled: input.quiet_hours.enabled,
      quiet_from: input.quiet_hours.from,
      quiet_until: input.quiet_hours.until,
      updated_at: new Date(),
    });

    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "notification_preferences.updated",
      entityType: "merchant",
      entityId: merchant.id,
      after: { categories: input.categories, quiet_hours: input.quiet_hours },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  });

  return getNotificationPreferences(userId);
}

// ---------------------------------------------------------------------
// Retention + a real generator (insurance / inspection expiry)
// ---------------------------------------------------------------------

/**
 * Deletes notifications older than the 90-day retention window. Called from
 * the daily 10:00 Nairobi reminder sweep so the feed footer's "Kept for 90
 * days" is enforced, not just claimed.
 */
export async function purgeExpiredNotifications(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return db<NotificationRow>("notifications").where("occurred_at", "<", cutoff).delete();
}

/**
 * Writes an "insurance expiring" notification for every live/paused vehicle
 * whose cover lapses within 30 days and hasn't already been flagged this
 * cycle. Unlike most notification sources this one is a real generator
 * today — `vehicles.insurance_expiry` is real merchant data, not a
 * dev-seed fixture. Also run from the daily sweep.
 */
export async function runExpiryNotificationSweep(now: Date = new Date()): Promise<number> {
  // Same horizon the vehicles service uses to call a document `expiring`, so
  // the dashboard card and this notification always describe the same set.
  const horizon = new Date(now.getTime() + EXPIRING_WITHIN_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const vehicles = await db<VehicleRow>("vehicles")
    .whereIn("status", ["live", "paused"])
    .whereNotNull("insurance_expiry")
    .where("insurance_expiry", ">=", today)
    .where("insurance_expiry", "<=", horizon)
    .select("*");

  // Collected per merchant as we go, so the post-commit enqueue delivers
  // exactly the rows this sweep wrote. An earlier version re-queried by a
  // `created_at >= now - 60s` window instead, which was wrong twice over:
  // it wasn't merchant-scoped (a concurrent writer's expiry rows would be
  // enqueued a second time), and `now` is a parameter — pass anything but
  // the current instant and the window matches nothing, or everything.
  const writtenByMerchant = new Map<string, string[]>();

  for (const vehicle of vehicles) {
    // One flag per vehicle per 30-day run of the window — a row inside the
    // retention horizon for this vehicle+category is enough to skip.
    const already = await db<NotificationRow>("notifications")
      .where({ merchant_id: vehicle.merchant_id, category: "expiry", subject_id: vehicle.id })
      .where("occurred_at", ">=", new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
      .first();
    if (already) continue;

    const expiry = vehicle.insurance_expiry as string;
    const days = Math.max(
      0,
      Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
    );
    const when = new Date(`${expiry}T00:00:00.000Z`).toLocaleDateString("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const id = await db.transaction(async (trx) =>
      notify(trx, {
        merchantId: vehicle.merchant_id,
        category: "expiry",
        title: `Insurance expires in ${days} ${days === 1 ? "day" : "days"} · ${vehicle.registration}`,
        body: `Cover lapses ${when}. Upload the renewal and the listing keeps taking bookings without a break.`,
        ref: vehicle.registration,
        subjectType: "vehicle",
        subjectId: vehicle.id,
      }),
    );
    writtenByMerchant.set(vehicle.merchant_id, [
      ...(writtenByMerchant.get(vehicle.merchant_id) ?? []),
      id,
    ]);
  }

  // Enqueue after the writes are committed, per lib/notifications.ts.
  // Imported lazily to keep the job module out of this file's import graph
  // for tests that only exercise the pure sweep.
  if (writtenByMerchant.size > 0) {
    const { enqueueNotificationDelivery } = await import("../../jobs/notification-delivery.js");
    for (const [merchantId, ids] of writtenByMerchant) {
      await enqueueNotificationDelivery(merchantId, ids);
    }
  }

  return [...writtenByMerchant.values()].reduce((sum, ids) => sum + ids.length, 0);
}

export { RETENTION_DAYS };

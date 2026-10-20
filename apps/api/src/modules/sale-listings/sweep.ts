import { db } from "../../db/client.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { EXPIRY_REMINDER_DAYS, deliverToSeller, notifySeller, title } from "./shared.js";
import type { SaleListingRow } from "./db-types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Part of the daily 10:00 Nairobi sweep (`runDailyReminderSweep`). Stale
 * adverts are the main trust problem on a classifieds site, so a listing
 * lives 60 days and then needs a one-tap renew:
 *
 * - seven days out, the seller is reminded once (`expiry_reminded_at`);
 * - past `expires_at`, a live or paused listing becomes `expired`.
 *
 * `under_offer` never expires - a deal is in progress, and taking the car
 * down under the buyer would be wrong.
 */
export async function runSaleListingSweep(now: Date = new Date()): Promise<{ reminded: number; expired: number }> {
  let reminded = 0;
  let expired = 0;

  const due = await db<SaleListingRow>("sale_listings")
    .whereIn("status", ["live", "paused"])
    .whereNull("expiry_reminded_at")
    .where("expires_at", "<=", new Date(now.getTime() + EXPIRY_REMINDER_DAYS * DAY_MS))
    .where("expires_at", ">", now);
  for (const listing of due) {
    const ids: string[] = [];
    await db.transaction(async (trx) => {
      const n = await trx("sale_listings").where({ id: listing.id }).whereNull("expiry_reminded_at").update({ expiry_reminded_at: now });
      if (!n) return;
      const days = Math.max(1, Math.ceil((listing.expires_at!.getTime() - now.getTime()) / DAY_MS));
      ids.push(
        await notifySeller(trx, listing, {
          category: "review",
          title: `${title(listing)} comes down in ${days} day${days === 1 ? "" : "s"}`,
          body: "Still for sale? Renew it in one tap and it stays listed for another 60 days.",
          ref: listing.ref,
          subjectType: "sale_listing",
          subjectId: listing.id,
        }),
      );
    });
    await deliverToSeller(listing, ids);
    if (ids.length) reminded++;
  }

  const lapsed = await db<SaleListingRow>("sale_listings")
    .whereIn("status", ["live", "paused"])
    .where("expires_at", "<=", now);
  for (const listing of lapsed) {
    const ids: string[] = [];
    await db.transaction(async (trx) => {
      const n = await trx("sale_listings")
        .where({ id: listing.id, status: listing.status })
        .update({ status: "expired" });
      if (!n) return;
      await writeAuditEntry(trx, {
        actorId: null,
        actorType: "system",
        action: "sale_listing.expired",
        entityType: "sale_listing",
        entityId: listing.id,
        before: { status: listing.status },
        after: { status: "expired" },
      });
      ids.push(
        await notifySeller(trx, listing, {
          category: "review",
          title: `${title(listing)} is no longer listed`,
          body: "It reached 60 days. Renew it from your listings if the car is still for sale.",
          ref: listing.ref,
          subjectType: "sale_listing",
          subjectId: listing.id,
        }),
      );
    });
    await deliverToSeller(listing, ids);
    if (ids.length) expired++;
  }

  return { reminded, expired };
}

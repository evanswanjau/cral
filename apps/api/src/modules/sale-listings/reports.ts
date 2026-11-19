import { ApiError } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { isUniqueViolation } from "../../lib/pg-errors.js";
import type { RequestContext } from "../merchant/service.js";
import type { SaleListingRow } from "./service.js";
import type { ReportSaleListingInput } from "./schemas.js";

/**
 * Report this listing (Phase 6 CS2 - openapi/customer-sales.yaml). A
 * signed-in buyer flags a live listing for Ops; the merchant never learns
 * who. The route rate-limits; the partial unique index keeps one open
 * report per buyer per listing.
 */

const ONE_OPEN_INDEX = "sale_listing_reports_one_open";

export async function fileSaleReport(userId: string, listingId: string, input: ReportSaleListingInput, ctx: RequestContext) {
  const listing = await db<SaleListingRow>("sale_listings").where({ id: listingId, status: "live" }).first();
  if (!listing) {
    throw new ApiError({ status: 404, type: "not_found", code: "sale_listing_not_found", message: "That listing isn't for sale any more." });
  }
  const id = generateId("saleListingReport");
  const now = new Date();
  const details = input.details?.trim() || null;
  try {
    await db.transaction(async (trx) => {
      await trx("sale_listing_reports").insert({
        id,
        sale_listing_id: listing.id,
        user_id: userId,
        reason: input.reason,
        details,
        status: "open",
        created_at: now,
        updated_at: now,
      });
      await writeAuditEntry(trx, {
        actorId: userId,
        actorType: "user",
        action: "sale_listing.reported",
        entityType: "sale_listing",
        entityId: listing.id,
        after: { report_id: id, reason: input.reason },
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err, ONE_OPEN_INDEX)) {
      throw new ApiError({
        status: 409,
        type: "conflict",
        code: "already_reported",
        message: "You've already reported this listing. CRAL is looking at it.",
      });
    }
    throw err;
  }
  return { id, status: "open" as const, created_at: now.toISOString() };
}

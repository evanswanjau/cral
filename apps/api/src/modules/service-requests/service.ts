import { ApiError, kes, type Money, type PaginatedResult } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { emailAdapter } from "../../lib/adapters.js";
import { emailHeading, emailLayout, emailMuted, emailParagraph } from "../../lib/email-templates.js";
import { notify } from "../../lib/notifications.js";
import { enqueueRenterNotificationDelivery } from "../../jobs/notification-delivery.js";
import type { ServiceRequestRow, ServiceRequestStatus } from "./db-types.js";
import type { CancelServiceRequestInput, CreateServiceRequestInput, ListMyServiceRequestsQuery } from "./schemas.js";

export interface RequestContext {
  ip: string | null;
  requestId: string | null;
}

/**
 * Where an internal "a new request landed" notice goes. Not a customer- or
 * merchant-facing address — CRAL's own dispatch inbox, so it's config, not
 * data, same pattern as `payouts/service.ts`'s `SUPPORT_EMAIL`.
 */
const SERVICES_EMAIL = process.env.SERVICES_SUPPORT_EMAIL ?? "support@cral.co.ke";

const REASON_LABEL: Record<string, string> = {
  mechanical_breakdown: "Mechanical breakdown",
  accident: "Accident",
};

function notFound(): never {
  throw new ApiError({
    status: 404,
    type: "not_found",
    code: "service_request_not_found",
    message: "That request doesn't exist on your account.",
  });
}

function badState(message: string, code = "service_request_wrong_state"): never {
  throw new ApiError({ status: 409, type: "conflict", code, message });
}

export interface ServiceRequestOut {
  id: string;
  reason: string;
  pickup_location: string;
  destination_location: string | null;
  contact_phone: string;
  description: string | null;
  distance_km: number | null;
  quoted_amount: Money | null;
  quote_note: string | null;
  quoted_at: string | null;
  status: ServiceRequestStatus;
  decline_reason: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

function serialize(row: ServiceRequestRow): ServiceRequestOut {
  return {
    id: row.id,
    reason: row.reason,
    pickup_location: row.pickup_location,
    destination_location: row.destination_location,
    contact_phone: row.contact_phone,
    description: row.description,
    distance_km: row.distance_km === null ? null : Number(row.distance_km),
    quoted_amount: row.quoted_amount === null ? null : kes(row.quoted_amount),
    quote_note: row.quote_note,
    quoted_at: row.quoted_at ? row.quoted_at.toISOString() : null,
    status: row.status,
    decline_reason: row.decline_reason,
    cancel_reason: row.cancel_reason,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

async function requireOwn(userId: string, id: string): Promise<ServiceRequestRow> {
  const row = await db<ServiceRequestRow>("service_requests").where({ id, user_id: userId }).first();
  if (!row) notFound();
  return row;
}

export async function createServiceRequest(
  userId: string,
  input: CreateServiceRequestInput,
  ctx: RequestContext,
): Promise<ServiceRequestOut> {
  const id = generateId("serviceRequest");
  const row = await db.transaction(async (trx) => {
    const [inserted] = await trx<ServiceRequestRow>("service_requests")
      .insert({
        id,
        user_id: userId,
        reason: input.reason,
        pickup_location: input.pickup_location,
        destination_location: input.destination_location ?? null,
        contact_phone: input.contact_phone,
        description: input.description ?? null,
        status: "requested",
      })
      .returning("*");

    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "service_request.created",
      entityType: "service_request",
      entityId: id,
      after: { reason: input.reason, pickup_location: input.pickup_location },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return inserted!;
  });

  // After the commit, deliberately — a bounced dispatch email must not lose
  // the request itself. Same reasoning as the payout-query support email.
  try {
    await emailAdapter.send({
      to: SERVICES_EMAIL,
      subject: `Towing request · ${REASON_LABEL[input.reason] ?? input.reason}`,
      html: emailLayout({
        preheader: "A new towing/recovery request needs a quote.",
        bodyHtml: [
          emailHeading("New towing request"),
          emailParagraph(`Reason: ${REASON_LABEL[input.reason] ?? input.reason}`),
          emailParagraph(`Pickup: ${row.pickup_location}`),
          emailParagraph(row.destination_location ? `Destination: ${row.destination_location}` : "Destination: not given"),
          emailParagraph(`Contact: ${row.contact_phone}`),
          row.description ? emailParagraph(row.description) : "",
          emailMuted(`Request ${id} · user ${userId}`),
        ].join(""),
      }),
    });
  } catch (error) {
    console.error("service request dispatch email failed", { requestId: id, error });
  }

  return serialize(row);
}

export async function listMyServiceRequests(
  userId: string,
  query: ListMyServiceRequestsQuery,
): Promise<PaginatedResult<ServiceRequestOut>> {
  let q = db<ServiceRequestRow>("service_requests").where({ user_id: userId });
  q = applyCursor(q, {
    sortColumn: "created_at",
    direction: "desc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const rows = await q.select("*");
  const page = toPaginatedResult(rows, query.limit, "created_at");
  return { ...page, data: page.data.map(serialize) };
}

export async function getMyServiceRequest(userId: string, id: string): Promise<ServiceRequestOut> {
  return serialize(await requireOwn(userId, id));
}

export async function cancelMyServiceRequest(
  userId: string,
  id: string,
  input: CancelServiceRequestInput,
  ctx: RequestContext,
): Promise<ServiceRequestOut> {
  const row = await requireOwn(userId, id);
  if (!["requested", "quoted"].includes(row.status)) {
    badState("This request can no longer be cancelled.");
  }

  const updated = await db.transaction(async (trx) => {
    const [next] = await trx<ServiceRequestRow>("service_requests")
      .where({ id })
      .update({ status: "cancelled", cancel_reason: input.reason ?? null, updated_at: new Date() })
      .returning("*");

    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "service_request.cancelled",
      entityType: "service_request",
      entityId: id,
      before: { status: row.status },
      after: { status: "cancelled" },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return next!;
  });

  return serialize(updated);
}

export async function acceptMyServiceRequestQuote(
  userId: string,
  id: string,
  ctx: RequestContext,
): Promise<ServiceRequestOut> {
  const row = await requireOwn(userId, id);
  if (row.status !== "quoted") {
    badState("There's no quote on this request to accept.", "no_quote_to_accept");
  }

  const updated = await db.transaction(async (trx) => {
    const [next] = await trx<ServiceRequestRow>("service_requests")
      .where({ id })
      .update({ status: "accepted", updated_at: new Date() })
      .returning("*");

    await writeAuditEntry(trx, {
      actorId: userId,
      actorType: "user",
      action: "service_request.quote_accepted",
      entityType: "service_request",
      entityId: id,
      before: { status: row.status },
      after: { status: "accepted" },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    const notificationId = await notify(trx, {
      userId,
      category: "booking",
      title: "Towing quote accepted",
      body: "We'll be in touch on the number you gave us to arrange dispatch.",
      subjectType: null,
      subjectId: null,
    });
    return { next: next!, notificationId };
  });

  await enqueueRenterNotificationDelivery([updated.notificationId]);
  return serialize(updated.next);
}

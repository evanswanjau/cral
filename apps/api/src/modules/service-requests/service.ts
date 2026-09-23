import type { Knex } from "knex";
import { ApiError, kes, type Money, type PaginatedResult } from "@cral/types";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { emailAdapter } from "../../lib/adapters.js";
import { emailHeading, emailLayout, emailMuted, emailParagraph } from "../../lib/email-templates.js";
import { normalizePhone } from "../../lib/identifier.js";
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

/**
 * Tells dispatch something changed on a request. Always after the commit:
 * the row is the record and the email is a courtesy, so a bounce must not
 * undo the renter's action.
 */
async function emailDispatch(row: ServiceRequestRow, heading: string, lines: string[]): Promise<void> {
  try {
    await emailAdapter.send({
      to: SERVICES_EMAIL,
      subject: `${heading} · ${REASON_LABEL[row.reason] ?? row.reason}`,
      html: emailLayout({
        preheader: heading,
        bodyHtml: [
          emailHeading(heading),
          emailParagraph(`Pickup: ${escapeHtml(row.pickup_location)}`),
          emailParagraph(`Contact: ${escapeHtml(row.contact_phone)}`),
          ...lines.map((l) => emailParagraph(escapeHtml(l))),
          emailMuted(`Request ${row.id} · user ${row.user_id}`),
        ].join(""),
      }),
    });
  } catch (error) {
    console.error("service request dispatch email failed", { requestId: row.id, heading, error });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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
  const contactPhone = normalizePhone(input.contact_phone);
  if (!contactPhone) {
    throw new ApiError({
      status: 422,
      type: "validation_error",
      code: "invalid_phone",
      message: "Enter a Kenyan mobile number, like 0712 345 678.",
      field: "contact_phone",
    });
  }

  const id = generateId("serviceRequest");
  const row = await db.transaction(async (trx) => {
    const [inserted] = await trx<ServiceRequestRow>("service_requests")
      .insert({
        id,
        user_id: userId,
        reason: input.reason,
        pickup_location: input.pickup_location,
        destination_location: input.destination_location ?? null,
        contact_phone: contactPhone,
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

  await emailDispatch(row, "New towing request", [
    `Reason: ${REASON_LABEL[row.reason] ?? row.reason}`,
    row.destination_location ? `Destination: ${row.destination_location}` : "Destination: not given",
    ...(row.description ? [row.description] : []),
  ]);

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

/**
 * Moves a request on only if it is still in the state the caller checked.
 * The renter and Ops act on the same row independently, so a plain
 * update-by-id would let a decline and an accept both "succeed".
 */
export async function transition(
  trx: Knex.Transaction,
  row: ServiceRequestRow,
  patch: Partial<ServiceRequestRow>,
): Promise<ServiceRequestRow> {
  const [next] = await trx<ServiceRequestRow>("service_requests")
    .where({ id: row.id, status: row.status })
    .update({ ...patch, updated_at: new Date() })
    .returning("*");
  if (!next) badState("This request changed while you were looking at it. Reload and try again.", "service_request_changed");
  return next;
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
    const next = await transition(trx, row, { status: "cancelled", cancel_reason: input.reason ?? null });
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
    return next;
  });

  if (row.status === "quoted") {
    await emailDispatch(updated, "Towing request cancelled", [
      `The renter cancelled after being quoted.${input.reason ? ` Reason: ${input.reason}` : ""}`,
    ]);
  }
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
    const next = await transition(trx, row, { status: "accepted" });
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
    return next;
  });

  // Ops is who has to act now - the renter already knows they accepted.
  await emailDispatch(updated, "Towing quote accepted - dispatch", [
    updated.quoted_amount === null
      ? "Quoted as subject to discussion - agree the price on the call."
      : `Agreed price: KES ${(updated.quoted_amount / 100).toLocaleString("en-KE")}.`,
  ]);
  return serialize(updated);
}

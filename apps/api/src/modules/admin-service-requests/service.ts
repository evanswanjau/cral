import { ApiError, kes, type Money, type PaginatedResult } from "@cral/types";
import { db } from "../../db/client.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import { emailAdapter } from "../../lib/adapters.js";
import { emailButton, emailHeading, emailLayout, emailMuted, emailParagraph } from "../../lib/email-templates.js";
import type { ServiceRequestRow, ServiceRequestStatus } from "../service-requests/db-types.js";
import type { DeclineServiceRequestInput, QueueQuery, QuoteServiceRequestInput } from "./schemas.js";

export interface AdminContextInput {
  adminId: string;
  adminName: string;
  ip: string | null;
  requestId: string | null;
}

function notFound(): never {
  throw new ApiError({
    status: 404,
    type: "not_found",
    code: "service_request_not_found",
    message: "That service request doesn't exist.",
  });
}

function badState(message: string, code = "service_request_wrong_state"): never {
  throw new ApiError({ status: 409, type: "conflict", code, message });
}

interface Requester {
  full_name: string | null;
  email: string;
}

export interface ServiceRequestQueueItem {
  id: string;
  reason: string;
  status: ServiceRequestStatus;
  pickup_location: string;
  destination_location: string | null;
  requester_name: string | null;
  requester_email: string;
  distance_km: number | null;
  quoted_amount: Money | null;
  created_at: string;
}

export interface ServiceRequestCase extends ServiceRequestQueueItem {
  contact_phone: string;
  description: string | null;
  quote_note: string | null;
  quoted_at: string | null;
  decline_reason: string | null;
  cancel_reason: string | null;
}

function toQueueItem(row: ServiceRequestRow, requester: Requester): ServiceRequestQueueItem {
  return {
    id: row.id,
    reason: row.reason,
    status: row.status,
    pickup_location: row.pickup_location,
    destination_location: row.destination_location,
    requester_name: requester.full_name,
    requester_email: requester.email,
    distance_km: row.distance_km === null ? null : Number(row.distance_km),
    quoted_amount: row.quoted_amount === null ? null : kes(row.quoted_amount),
    created_at: row.created_at.toISOString(),
  };
}

function toCase(row: ServiceRequestRow, requester: Requester): ServiceRequestCase {
  return {
    ...toQueueItem(row, requester),
    contact_phone: row.contact_phone,
    description: row.description,
    quote_note: row.quote_note,
    quoted_at: row.quoted_at ? row.quoted_at.toISOString() : null,
    decline_reason: row.decline_reason,
    cancel_reason: row.cancel_reason,
  };
}

async function requireRow(id: string): Promise<ServiceRequestRow> {
  const row = await db<ServiceRequestRow>("service_requests").where({ id }).first();
  if (!row) notFound();
  return row;
}

async function requesterOf(userId: string): Promise<Requester> {
  const row = await db("users").where({ id: userId }).first("full_name", "email");
  return { full_name: row?.full_name ?? null, email: row?.email ?? "" };
}

export async function listQueue(query: QueueQuery): Promise<PaginatedResult<ServiceRequestQueueItem>> {
  let q = db<ServiceRequestRow>("service_requests");
  if (query.status && query.status !== "all") {
    q = q.where({ status: query.status });
  } else if (!query.status) {
    q = q.whereIn("status", ["requested", "quoted"]);
  }
  q = applyCursor(q, {
    sortColumn: "created_at",
    direction: "asc",
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const rows = await q.select("*");
  const page = toPaginatedResult(rows, query.limit, "created_at");

  const requesters = new Map<string, Requester>();
  for (const row of page.data) {
    if (!requesters.has(row.user_id)) requesters.set(row.user_id, await requesterOf(row.user_id));
  }

  return { ...page, data: page.data.map((row) => toQueueItem(row, requesters.get(row.user_id)!)) };
}

export async function getCase(id: string): Promise<ServiceRequestCase> {
  const row = await requireRow(id);
  return toCase(row, await requesterOf(row.user_id));
}

export async function quoteRequest(
  id: string,
  input: QuoteServiceRequestInput,
  ctx: AdminContextInput,
): Promise<ServiceRequestCase> {
  const row = await requireRow(id);
  if (!["requested", "quoted"].includes(row.status)) {
    badState("This request is no longer open for a quote.");
  }

  const amount = input.amount_cents ?? null;
  const updated = await db.transaction(async (trx) => {
    const [next] = await trx<ServiceRequestRow>("service_requests")
      .where({ id })
      .update({
        status: "quoted",
        distance_km: input.distance_km == null ? null : String(input.distance_km),
        quoted_amount: amount,
        quoted_currency: amount === null ? null : "KES",
        quote_note: input.note ?? null,
        quoted_by: ctx.adminId,
        quoted_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    await writeAuditEntry(trx, {
      actorId: ctx.adminId,
      actorType: "admin",
      action: "service_request.quoted",
      entityType: "service_request",
      entityId: id,
      before: { status: row.status },
      after: { status: "quoted", amount_cents: amount, distance_km: input.distance_km ?? null },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return next!;
  });

  const requester = await requesterOf(row.user_id);
  const priceLine =
    amount === null
      ? "The quote is subject to discussion - we'll agree the price on the call."
      : `Quoted price: KES ${(amount / 100).toLocaleString("en-KE")}.`;
  try {
    await emailAdapter.send({
      to: requester.email,
      subject: "Your towing request has been quoted",
      html: emailLayout({
        preheader: "CRAL has a quote for your towing request.",
        bodyHtml: [
          emailHeading("Your towing request has been quoted"),
          emailParagraph(priceLine),
          input.note ? emailParagraph(input.note) : "",
          emailMuted(`Request ${id}`),
          emailButton("View request", "https://cral.co.ke/services"),
        ].join(""),
      }),
    });
  } catch (error) {
    console.error("service request quote email failed", { requestId: id, error });
  }

  return toCase(updated, requester);
}

export async function declineRequest(
  id: string,
  input: DeclineServiceRequestInput,
  ctx: AdminContextInput,
): Promise<ServiceRequestCase> {
  const row = await requireRow(id);
  if (["completed", "cancelled", "declined"].includes(row.status)) {
    badState("This request is already closed.");
  }

  const updated = await db.transaction(async (trx) => {
    const [next] = await trx<ServiceRequestRow>("service_requests")
      .where({ id })
      .update({
        status: "declined",
        decline_reason: input.reason,
        decided_by: ctx.adminId,
        decided_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    await writeAuditEntry(trx, {
      actorId: ctx.adminId,
      actorType: "admin",
      action: "service_request.declined",
      entityType: "service_request",
      entityId: id,
      before: { status: row.status },
      after: { status: "declined", reason: input.reason },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return next!;
  });

  const requester = await requesterOf(row.user_id);
  try {
    await emailAdapter.send({
      to: requester.email,
      subject: "We can't take your towing request",
      html: emailLayout({
        preheader: "An update on your towing request.",
        bodyHtml: [
          emailHeading("We can't take this one"),
          emailParagraph(input.reason),
          emailMuted(`Request ${id}`),
        ].join(""),
      }),
    });
  } catch (error) {
    console.error("service request decline email failed", { requestId: id, error });
  }

  return toCase(updated, requester);
}

export async function completeRequest(id: string, ctx: AdminContextInput): Promise<ServiceRequestCase> {
  const row = await requireRow(id);
  if (row.status !== "accepted") {
    badState("Only an accepted request can be marked complete.");
  }

  const updated = await db.transaction(async (trx) => {
    const [next] = await trx<ServiceRequestRow>("service_requests")
      .where({ id })
      .update({ status: "completed", decided_by: ctx.adminId, decided_at: new Date(), updated_at: new Date() })
      .returning("*");

    await writeAuditEntry(trx, {
      actorId: ctx.adminId,
      actorType: "admin",
      action: "service_request.completed",
      entityType: "service_request",
      entityId: id,
      before: { status: row.status },
      after: { status: "completed" },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return next!;
  });

  return toCase(updated, await requesterOf(row.user_id));
}

import { ApiError, kes, type Money } from "@cral/types";
import { db } from "../../db/client.js";
import { applyCursor, toPaginatedResult } from "../../lib/pagination.js";
import type { BookingRow, BookingStatus } from "../bookings/db-types.js";
import type { VehicleRow, DocumentRow } from "../merchant/db-types.js";
import type { PaymentRequestRow } from "../payments/service.js";
import { RENTER_DOC_KINDS } from "../customer-account/schemas.js";

/**
 * Read-only Ops visibility into customer bookings - the same footing as
 * the Merchants lens ("approving a vehicle does not verify the business -
 * those are two separate decisions"). No decision endpoint lives here;
 * cancel/refund/dispute belong to a later phase.
 */

export interface ListAdminBookingsQuery {
  status?: BookingStatus;
  cursor?: string;
  limit: number;
}

interface NameLookup {
  hirerNames: Map<string, string>;
  merchantNames: Map<string, string>;
  vehicleLabels: Map<string, string>;
}

async function lookupsFor(bookings: BookingRow[]): Promise<NameLookup> {
  const hirerIds = [...new Set(bookings.map((b) => b.hirer_id))];
  const merchantIds = [...new Set(bookings.map((b) => b.merchant_id))];
  const vehicleIds = [...new Set(bookings.map((b) => b.vehicle_id))];

  const [hirers, merchants, vehicles] = await Promise.all([
    db("users").whereIn("id", hirerIds).select("id", "full_name", "email"),
    db("merchants").whereIn("id", merchantIds).select("id", "owner_type", "company_name", "first_name", "surname"),
    db<VehicleRow>("vehicles").whereIn("id", vehicleIds).select("id", "make", "model", "year", "registration"),
  ]);

  const hirerNames = new Map(hirers.map((h) => [h.id, h.full_name ?? h.email]));
  const merchantNames = new Map(
    merchants.map((m) => [
      m.id,
      m.owner_type === "company" && m.company_name
        ? m.company_name
        : [m.first_name, m.surname].filter(Boolean).join(" ") || "(no name on file)",
    ]),
  );
  const vehicleLabels = new Map(
    vehicles.map((v) => [v.id, `${v.make} ${v.model} ${v.year} (${v.registration})`]),
  );

  return { hirerNames, merchantNames, vehicleLabels };
}

function serializeSummary(b: BookingRow, lookups: NameLookup) {
  return {
    id: b.id,
    ref: b.ref,
    status: b.status,
    pickup_at: b.pickup_at.toISOString(),
    dropoff_at: b.dropoff_at.toISOString(),
    gross: kes(b.gross_amount) as Money,
    hirer_name: lookups.hirerNames.get(b.hirer_id) ?? "(unknown)",
    merchant_name: lookups.merchantNames.get(b.merchant_id) ?? "(unknown)",
    vehicle_label: lookups.vehicleLabels.get(b.vehicle_id) ?? "(vehicle no longer on file)",
    created_at: b.created_at.toISOString(),
  };
}

export async function listAdminBookings(query: ListAdminBookingsQuery) {
  let qb = db<BookingRow>("bookings");
  if (query.status) qb = qb.where({ status: query.status });
  qb = applyCursor(qb, { sortColumn: "created_at", direction: "desc", limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) });

  const rows = await qb;
  const result = toPaginatedResult(rows, query.limit, "created_at");
  const lookups = await lookupsFor(result.data);

  return {
    data: result.data.map((b) => serializeSummary(b, lookups)),
    next_cursor: result.next_cursor,
    has_more: result.has_more,
  };
}

const PAYMENT_STATUS_NONE = "none" as const;

export async function getAdminBooking(id: string) {
  const booking = await db<BookingRow>("bookings").where({ id }).first();
  if (!booking) {
    throw new ApiError({ status: 404, type: "not_found", code: "booking_not_found", message: "No such booking." });
  }

  const [lookups, hirer, idDocs, payment] = await Promise.all([
    lookupsFor([booking]),
    db("users").where({ id: booking.hirer_id }).first("email"),
    db<DocumentRow>("documents")
      .where({ user_id: booking.hirer_id })
      .whereIn("kind", RENTER_DOC_KINDS),
    booking.payment_request_id
      ? db<PaymentRequestRow>("payment_requests").where({ id: booking.payment_request_id }).first("status")
      : null,
  ]);

  const idVerified = (RENTER_DOC_KINDS as readonly string[]).every(
    (kind) => idDocs.find((d) => d.kind === kind)?.review_state === "ok",
  );

  return {
    ...serializeSummary(booking, lookups),
    hirer_id: booking.hirer_id,
    hirer_email: hirer?.email ?? "(unknown)",
    hirer_id_verified: idVerified,
    merchant_id: booking.merchant_id,
    vehicle_id: booking.vehicle_id,
    pickup_location: booking.pickup_location,
    dropoff_location: booking.dropoff_location,
    note_from_hirer: booking.note_from_hirer,
    commission: kes(booking.commission_amount) as Money,
    merchant_net: kes(booking.merchant_net_amount) as Money,
    payment_status: payment?.status ?? PAYMENT_STATUS_NONE,
    response_due_at: booking.response_due_at ? booking.response_due_at.toISOString() : null,
    decline_reason_code: booking.decline_reason_code,
    cancel_reason: booking.cancel_reason,
    returned_at: booking.returned_at ? booking.returned_at.toISOString() : null,
  };
}

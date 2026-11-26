import { db } from "../db/client.js";
import type { BookingRow } from "../modules/bookings/db-types.js";
import type { DocumentRow } from "../modules/merchant/db-types.js";
import type { RenterDocKind } from "../modules/customer-account/schemas.js";

/**
 * Which of the renter's papers a hire needs, and whether Ops has cleared
 * them (owner's decision 3, 2026-11-26, `docs/plans/hire-that-works.md`
 * H5). One rule, read by the request gate (`createBooking`), the pay gate
 * (`initiatePayment`), the pickup gate (`completeHandover`) and the
 * booking's own `documents` block, so the four never disagree:
 *
 * - The national ID, always: someone is handing over a vehicle or a
 *   driver and needs to know who to.
 * - The driving licence only when the renter drives: a self-drive
 *   vehicle with no driver of the owner's (or of another owner's, on a
 *   linked booking) coming with it. A chauffeured truck, a machine with
 *   its operator, or a driver for the renter's own car needs no licence.
 */
export function papersNeeded(hire: { hasVehicle: boolean; chauffeured: boolean; hasDriver: boolean }): RenterDocKind[] {
  const renterDrives = hire.hasVehicle && !hire.chauffeured && !hire.hasDriver;
  return renterDrives ? ["national_id", "driving_licence"] : ["national_id"];
}

export type PaperState = "missing" | DocumentRow["review_state"];

export interface BookingPapers {
  /** true once every paper this hire needs is accepted by Ops (`ok`). */
  cleared: boolean;
  items: { kind: RenterDocKind; state: PaperState; review_note: string | null }[];
}

/** The papers a stored booking needs. A linked car booking's driver sits on its other half. */
export async function papersNeededForBooking(
  booking: Pick<BookingRow, "vehicle_id" | "driver_id" | "linked_booking_id">,
): Promise<RenterDocKind[]> {
  const vehicle = booking.vehicle_id
    ? await db("vehicles").where({ id: booking.vehicle_id }).first("chauffeured")
    : null;
  return papersNeeded({
    hasVehicle: !!booking.vehicle_id,
    chauffeured: !!vehicle?.chauffeured,
    // On a car + another owner's driver request, the car's own row has no
    // driver; its linked half is the driver-only booking.
    hasDriver: !!booking.driver_id || !!booking.linked_booking_id,
  });
}

export async function papersFor(userId: string, needed: RenterDocKind[]): Promise<BookingPapers> {
  const rows = await db<DocumentRow>("documents").where({ user_id: userId }).whereIn("kind", needed);
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  const items = needed.map((kind) => {
    const row = byKind.get(kind);
    return {
      kind,
      state: (row?.review_state ?? "missing") as PaperState,
      review_note: row?.review_note ?? null,
    };
  });
  return { cleared: items.every((i) => i.state === "ok"), items };
}

export async function bookingPapers(
  booking: Pick<BookingRow, "hirer_id" | "vehicle_id" | "driver_id" | "linked_booking_id">,
): Promise<BookingPapers> {
  return papersFor(booking.hirer_id, await papersNeededForBooking(booking));
}

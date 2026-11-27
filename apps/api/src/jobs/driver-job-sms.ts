import { db } from "../db/client.js";
import { generateId } from "../lib/ids.js";
import { writeAuditEntry } from "../lib/audit.js";
import { smsAdapter } from "../lib/adapters.js";
import { generateOtpCode, hashCode } from "../lib/otp.js";
import { PICKUP_CODE_DIGITS } from "../lib/handover-codes.js";
import type { BookingRow, HandoverRow } from "../modules/bookings/db-types.js";

/**
 * The driver hears about a paid job (owner's call, 2026-11-27 - PR DR4 of
 * `docs/plans/drivers-that-work.md`). Before this a driver was a record
 * with no login and no message: only the owner's account heard about
 * the job.
 *
 * One SMS to `drivers.phone` once a booking with a driver is paid
 * (`applySettlement` enqueues it after commit, on the
 * notification-delivery queue). Plain words: the ref, when, where, the
 * renter's first name. Never the commission, the deposit or any money.
 *
 * **A booking with no car of the merchant's** (driver only, or the driver
 * half of a linked booking) also carries the pickup code, which then runs
 * driver to renter: the driver reads it out, the renter enters it on the
 * trip page (`POST /bookings/{id}/driver-code`), and the job starts
 * without the owner's login. Car and car-plus-driver bookings keep the
 * merchant's handover, so their SMS has no code.
 *
 * The code is minted here, in the worker, so the queue's Redis payload
 * only ever holds the booking id: the code exists in plain text only in
 * this function and in the SMS. A retry (the SMS failed) mints a fresh
 * code and expires the old row, so the only valid code is the one in the
 * text that actually went out. `bookings.driver_sms_sent_at` stops a
 * redelivered job from texting twice.
 */

export async function deliverDriverJobSms(bookingId: string): Promise<void> {
  const booking = await db<BookingRow>("bookings").where({ id: bookingId }).first();
  if (!booking || !booking.driver_id || booking.driver_sms_sent_at) return;
  // Paid, and not since cancelled or already under way.
  if (booking.status !== "confirmed" || !booking.payment_request_id) return;

  const driver = await db("drivers").where({ id: booking.driver_id }).first("full_name", "phone");
  if (!driver?.phone) return;
  const hirer = await db("users").where({ id: booking.hirer_id }).first("full_name");
  const renter = firstName(hirer?.full_name) ?? "the renter";

  const code = booking.vehicle_id === null ? generateOtpCode(PICKUP_CODE_DIGITS) : null;
  if (code) {
    await db.transaction(async (trx) => {
      // A retry's new code replaces the one from the attempt that failed.
      await trx<HandoverRow>("handovers")
        .where({ booking_id: booking.id, kind: "pickup", code_holder: "driver", state: "otp_sent" })
        .update({ state: "expired" });
      await trx<HandoverRow>("handovers").insert({
        id: generateId("handover"),
        booking_id: booking.id,
        kind: "pickup",
        code_holder: "driver",
        state: "otp_sent",
        otp_code_hash: hashCode(code),
        otp_attempts: 0,
        otp_sent_at: new Date(),
        // Good for the whole booking: the driver may be texted days ahead.
        otp_expires_at: booking.dropoff_at,
        // The renter never sees the driver's phone, masked or not.
        masked_destination: null,
        expires_at: booking.dropoff_at,
      });
      await writeAuditEntry(trx, {
        actorType: "system",
        actorId: "driver-job-sms",
        action: "handover.pickup.code_to_driver",
        entityType: "booking",
        entityId: booking.id,
      });
    });
  }

  const car = await carLine(booking);
  await smsAdapter.send({ to: driver.phone as string, body: driverJobSmsBody({ booking, renter, car, code }) });

  await db.transaction(async (trx) => {
    await trx<BookingRow>("bookings").where({ id: booking.id }).update({ driver_sms_sent_at: new Date() });
    await trx("booking_events").insert({
      id: generateId("bookingEvent"),
      booking_id: booking.id,
      merchant_id: booking.merchant_id,
      kind: "driver_texted",
      tone: "grey",
      label: `Job texted to ${firstName(driver.full_name as string) ?? "the driver"}`,
      body: code
        ? `With the pickup code. ${renter} enters it in the CRAL app when they meet, so the job starts without your login.`
        : "When, where and who. No code: you run the handover as usual.",
      actor_type: "system",
      actor_name: null,
    });
    await writeAuditEntry(trx, {
      actorType: "system",
      actorId: "driver-job-sms",
      action: "booking.driver_texted",
      entityType: "booking",
      entityId: booking.id,
      after: { with_code: code !== null },
    });
  });
}

export function driverJobSmsBody(input: {
  booking: Pick<BookingRow, "ref" | "pickup_at" | "dropoff_at" | "pickup_location">;
  renter: string;
  car: string | null;
  code: string | null;
}): string {
  const { booking, renter, car, code } = input;
  const parts = [
    `CRAL job ${booking.ref}.`,
    `${nairobiWhen(booking.pickup_at)} to ${nairobiWhen(booking.dropoff_at)}.`,
    `Pickup: ${clip(booking.pickup_location, 80)}.`,
    `Renter: ${renter}.`,
    car ? `Car: ${clip(car, 60)}.` : null,
    code ? `When you meet, read ${renter} this code: ${code}. Say it only in person.` : null,
  ];
  return parts.filter(Boolean).join(" ");
}

/** The car the driver will drive, in a few words, when we know it. */
async function carLine(booking: BookingRow): Promise<string | null> {
  if (booking.hire_car_details) return booking.hire_car_details;
  // Car + driver: the merchant's own car. Linked driver half: the other owner's.
  const vehicleId =
    booking.vehicle_id ??
    (booking.linked_booking_id
      ? ((await db("bookings").where({ id: booking.linked_booking_id }).first("vehicle_id"))?.vehicle_id as string | null)
      : null);
  if (!vehicleId) return null;
  const v = await db("vehicles").where({ id: vehicleId }).first("make", "model", "registration");
  return v ? `${v.make} ${v.model} ${v.registration}` : null;
}

const WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "Fri 28 Nov, 09:00" in Nairobi time - display only, storage stays UTC. */
export function nairobiWhen(instant: Date): string {
  return WHEN.format(instant);
}

function firstName(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

function clip(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}

import { ulid } from "ulid";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { nextListingRef } from "../../lib/vehicle-events.js";
import { hashPassword } from "../../lib/password.js";
import { computeBookingPricing, computeLateCancellationFee } from "../../lib/booking-pricing.js";
import { getOrCreateMerchant } from "../merchant/service.js";
import type { VehicleRow } from "../merchant/db-types.js";
import type { BookingEventRow, BookingRow, BookingStatus } from "./db-types.js";

/**
 * There is no customer portal yet to generate real booking requests
 * (CLAUDE.md: merchant portal only, Phase 1). This is how the Bookings
 * screen gets fixture data to demo the full lifecycle against — never
 * mounted in production (see routes.ts's NODE_ENV guard).
 */

const HIRERS = [
  { name: "Faith Njeri", email: "faith.njeri" },
  { name: "Samuel Mutiso", email: "samuel.mutiso" },
  { name: "Safiri Tours Ltd", email: "ops.safiritours" },
  { name: "Dennis Kariuki", email: "dennis.kariuki" },
] as const;

async function getOrCreateHirer(name: string, emailPrefix: string): Promise<string> {
  const email = `${emailPrefix}@example.test`;
  const existing = await db("users").where({ email }).first();
  if (existing) return existing.id as string;

  const [user] = await db("users")
    .insert({
      id: generateId("user"),
      full_name: name,
      phone: `+2547${ulid().slice(-8).replace(/[A-Z]/g, "1")}`,
      email,
      password_hash: await hashPassword(`dev-seed-${ulid()}`),
      roles: ["customer"],
      email_verified: true,
      phone_verified: true,
    })
    .returning("*");
  if (!user) throw new Error("Failed to seed hirer");
  return user.id as string;
}

async function getOrCreateSeedVehicle(merchantId: string): Promise<VehicleRow> {
  const existing = await db<VehicleRow>("vehicles").where({ merchant_id: merchantId }).orderBy("created_at", "asc").first();
  if (existing) return existing;

  const [vehicle] = await db<VehicleRow>("vehicles")
    .insert({
      id: generateId("vehicle"),
      merchant_id: merchantId,
      type: "sedan",
      make: "Nissan",
      model: "Note",
      year: "2020",
      registration: `KDA ${ulid().slice(-3).replace(/[A-Z]/g, "9")}Q`,
      transmission: "Automatic",
      fuel: "Petrol",
      county: "Nairobi",
      pickup_address: "Kilimani, Nairobi",
      daily_rate_amount: 420000,
      status: "live",
      listing_ref: await nextListingRef(db),
    })
    .returning("*");
  if (!vehicle) throw new Error("Failed to seed vehicle");
  return vehicle;
}

async function appendEvent(
  bookingId: string,
  merchantId: string,
  input: Pick<BookingEventRow, "kind" | "tone" | "label" | "body" | "actor_type">,
): Promise<void> {
  await db<BookingEventRow>("booking_events").insert({
    id: generateId("bookingEvent"),
    booking_id: bookingId,
    merchant_id: merchantId,
    kind: input.kind,
    tone: input.tone,
    label: input.label,
    body: input.body,
    actor_type: input.actor_type,
  });
}

async function nextRef(): Promise<string> {
  const result = await db.raw<{ rows: { n: string }[] }>("select nextval('booking_ref_seq') as n");
  return `CB-${result.rows[0]!.n}`;
}

interface FixtureSpec {
  hirer: (typeof HIRERS)[number];
  status: BookingStatus;
  daysFromNow: number; // pickup offset
  durationDays: number;
  note: string | null;
}

const FIXTURES: FixtureSpec[] = [
  { hirer: HIRERS[0], status: "requested", daysFromNow: 3, durationDays: 3, note: "Weekend trip to Naivasha with my sister. I will be the only driver." },
  { hirer: HIRERS[2], status: "requested", daysFromNow: 8, durationDays: 7, note: "Two guests, Maasai Mara circuit. Driver must have park entry experience." },
  { hirer: HIRERS[1], status: "confirmed", daysFromNow: 5, durationDays: 2, note: null },
  { hirer: HIRERS[1], status: "active", daysFromNow: -1, durationDays: 3, note: null },
  { hirer: HIRERS[2], status: "completed", daysFromNow: -10, durationDays: 7, note: null },
  { hirer: HIRERS[3], status: "cancelled", daysFromNow: -6, durationDays: 2, note: null },
];

export async function seedDevBookings(userId: string) {
  const merchant = await getOrCreateMerchant(userId);
  const vehicle = await getOrCreateSeedVehicle(merchant.id);

  const created: BookingRow[] = [];

  for (const fixture of FIXTURES) {
    const hirerId = await getOrCreateHirer(fixture.hirer.name, fixture.hirer.email);
    const pickupAt = new Date(Date.now() + fixture.daysFromNow * 24 * 60 * 60 * 1000);
    const dropoffAt = new Date(pickupAt.getTime() + fixture.durationDays * 24 * 60 * 60 * 1000);
    const pricing = computeBookingPricing(vehicle.daily_rate_amount, fixture.durationDays);
    const ref = await nextRef();

    const row: Record<string, unknown> = {
      id: generateId("booking"),
      ref,
      merchant_id: merchant.id,
      vehicle_id: vehicle.id,
      hirer_id: hirerId,
      status: fixture.status,
      pickup_at: pickupAt,
      dropoff_at: dropoffAt,
      pickup_location: vehicle.pickup_address ?? "Nairobi",
      dropoff_location: vehicle.pickup_address ?? "Nairobi",
      note_from_hirer: fixture.note,
      gross_amount: pricing.gross.amount,
      commission_amount: pricing.commission.amount,
      merchant_net_amount: pricing.merchantNet.amount,
      deposit_amount: pricing.deposit.amount,
      payout_method: "mpesa",
      payout_detail: "0733376061",
      payout_account_name: "Mwangi Karanja",
    };

    if (fixture.status === "requested") {
      row.response_due_at = new Date(Date.now() + 10 * 60 * 60 * 1000);
    }
    if (fixture.status === "completed") {
      row.has_pickup_condition_photos = true;
      row.returned_at = new Date(Date.now() - 4 * 60 * 60 * 1000); // "returned" 4h ago, 20h left on the 24h hold
      row.deposit_release_at = new Date(Date.now() + 20 * 60 * 60 * 1000);
      row.rating_open_until = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000);
    }
    if (fixture.status === "cancelled") {
      const { fee, commission, merchantKeeps, refund } = computeLateCancellationFee(pricing.gross.amount);
      row.cancellation_fee_amount = fee.amount;
      row.cancellation_fee_currency = fee.currency;
      row.commission_amount = commission.amount;
      row.merchant_net_amount = merchantKeeps.amount;
      row.refund_amount = refund.amount;
      row.refund_currency = refund.currency;
      row.cancel_reason = "Plans changed";
    }

    const [booking] = await db<BookingRow>("bookings").insert(row).returning("*");
    if (!booking) continue;
    created.push(booking);

    await appendEvent(booking.id, merchant.id, {
      kind: "requested",
      tone: "amber",
      label: "Request received",
      body: `Hirer has paid KES ${(pricing.gross.amount / 100).toLocaleString("en-KE")} to CRAL. Held until you answer.`,
      actor_type: "hirer",
    });

    if (fixture.status !== "requested") {
      await appendEvent(booking.id, merchant.id, { kind: "confirmed", tone: "blue", label: "You accepted the booking", body: "Pick-up details sent.", actor_type: "merchant" });
    }
    if (fixture.status === "active" || fixture.status === "completed") {
      await appendEvent(booking.id, merchant.id, { kind: "vehicle_handed_over", tone: "green", label: "Vehicle handed over", body: "Checked over together at pick-up · condition photos attached.", actor_type: "merchant" });
    }
    if (fixture.status === "completed") {
      await appendEvent(booking.id, merchant.id, { kind: "vehicle_returned", tone: "green", label: "Vehicle returned", body: "Checked over on return · no claim raised.", actor_type: "merchant" });
      // A real rating so the hirer's badge shows something to demo against.
      await db("ratings")
        .insert({
          id: generateId("review"),
          booking_id: booking.id,
          rater_id: userId,
          ratee_id: hirerId,
          ratee_type: "hirer",
          stars: 5,
          comment: "On time, tank full, no marks.",
        })
        .onConflict(["booking_id", "rater_id", "ratee_type"])
        .ignore();
      await appendEvent(booking.id, merchant.id, { kind: "rated", tone: "grey", label: "You rated the hirer 5/5", body: null, actor_type: "merchant" });
    }
    if (fixture.status === "cancelled") {
      await appendEvent(booking.id, merchant.id, { kind: "cancelled", tone: "red", label: "Cancelled late by the hirer", body: "Cancelled after pick-up time, so the 25% late fee applies.", actor_type: "hirer" });
    }
  }

  return { seeded: created.length };
}

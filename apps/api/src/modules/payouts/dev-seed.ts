import { ulid } from "ulid";
import { db } from "../../db/client.js";
import { generateId } from "../../lib/ids.js";
import { nextListingRef } from "../../lib/vehicle-events.js";
import { hashPassword } from "../../lib/password.js";
import { computeBookingPricing } from "../../lib/booking-pricing.js";
import { getOrCreateMerchant } from "../merchant/service.js";
import type { VehicleRow } from "../merchant/db-types.js";
import type { BookingRow } from "../bookings/db-types.js";
import { cutPayoutRun, nextMonday } from "./service.js";

/**
 * There is no customer portal generating real bookings and no payment rail
 * settling real runs (CLAUDE.md: merchant portal only, Phase 1), so this is
 * how the Payouts screen gets history to render — never mounted in
 * production (see routes.ts's NODE_ENV guard).
 *
 * Deliberately separate from the bookings dev-seed: that one's "completed"
 * fixture is mid-deposit-hold on purpose (20h left on the 24h clock), so it
 * is correctly *not* payable. Payouts needs bookings whose hold has already
 * lapsed, which means older fixtures of its own rather than mutating the
 * bookings seeder's.
 *
 * The M-Pesa codes are the design file's own, so a seeded screen matches the
 * mockups; the dates are relative to today so the eight-week chart always
 * has something in it.
 */

const HIRERS = [
  { name: "Josphat Ndegwa", email: "josphat.ndegwa" },
  { name: "Alice Njoki", email: "alice.njoki" },
  { name: "Mercy Atieno", email: "mercy.atieno" },
  { name: "Peter Ochieng", email: "peter.ochieng" },
] as const;

interface RunFixture {
  /** How many whole weeks ago the run went out. */
  weeksAgo: number;
  /** Safaricom code, from the design's own PAYOUTS const. Null leaves it scheduled. */
  code: string | null;
  hires: { hirer: (typeof HIRERS)[number]; durationDays: number }[];
}

const RUNS: RunFixture[] = [
  { weeksAgo: 5, code: "SJ1D40MB7X", hires: [{ hirer: HIRERS[2], durationDays: 3 }] },
  {
    weeksAgo: 3,
    code: "SJ2H88TP4C",
    hires: [
      { hirer: HIRERS[0], durationDays: 4 },
      { hirer: HIRERS[1], durationDays: 2 },
    ],
  },
  { weeksAgo: 2, code: "SJ4K19XQ2M", hires: [{ hirer: HIRERS[3], durationDays: 5 }] },
  // Cut but not sent — this is the run the "Next payout" tile counts.
  { weeksAgo: 0, code: null, hires: [{ hirer: HIRERS[0], durationDays: 3 }, { hirer: HIRERS[2], durationDays: 2 }] },
];

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
      make: "Toyota",
      model: "Fielder",
      year: "2018",
      registration: `KDG ${ulid().slice(-3).replace(/[A-Z]/g, "2")}V`,
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

async function nextBookingRef(): Promise<string> {
  const result = await db.raw<{ rows: { n: string }[] }>("select nextval('booking_ref_seq') as n");
  return `CB-${result.rows[0]!.n}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function seedDevPayouts(userId: string) {
  const merchant = await getOrCreateMerchant(userId);
  const vehicle = await getOrCreateSeedVehicle(merchant.id);
  const user = await db("users").where({ id: userId }).first("phone", "full_name");
  const destination = {
    method: "mpesa",
    detail: user?.phone ?? "+254733376061",
    accountName: user?.full_name ?? "Mwangi Karanja",
  };

  const refs: string[] = [];

  for (const fixture of RUNS) {
    // Bookings that finished during the week this run covers, with the
    // deposit hold already lapsed — that is what makes them payable.
    const bookingIds: string[] = [];

    for (const hire of fixture.hires) {
      const dropoffAt = new Date(Date.now() - (fixture.weeksAgo * 7 + 2) * DAY_MS);
      const pickupAt = new Date(dropoffAt.getTime() - hire.durationDays * DAY_MS);
      const pricing = computeBookingPricing(vehicle.daily_rate_amount, hire.durationDays);

      const [booking] = await db<BookingRow>("bookings")
        .insert({
          id: generateId("booking"),
          ref: await nextBookingRef(),
          merchant_id: merchant.id,
          vehicle_id: vehicle.id,
          hirer_id: await getOrCreateHirer(hire.hirer.name, hire.hirer.email),
          status: "completed",
          pickup_at: pickupAt,
          dropoff_at: dropoffAt,
          pickup_location: vehicle.pickup_address ?? "Nairobi",
          dropoff_location: vehicle.pickup_address ?? "Nairobi",
          note_from_hirer: null,
          gross_amount: pricing.gross.amount,
          gross_currency: pricing.gross.currency,
          commission_amount: pricing.commission.amount,
          commission_currency: pricing.commission.currency,
          merchant_net_amount: pricing.merchantNet.amount,
          merchant_net_currency: pricing.merchantNet.currency,
          deposit_amount: pricing.deposit.amount,
          deposit_currency: pricing.deposit.currency,
          payout_method: "mpesa",
          payout_detail: "0733376061",
          payout_account_name: destination.accountName,
          has_pickup_condition_photos: true,
          returned_at: dropoffAt,
          deposit_release_at: new Date(dropoffAt.getTime() + DAY_MS),
          deposit_released: true,
          rating_open_until: new Date(dropoffAt.getTime() + 14 * DAY_MS),
        })
        .returning("*");
      if (booking) bookingIds.push(booking.id);
    }

    if (bookingIds.length === 0) continue;

    // Runs go out on Mondays ("Weekly · Mondays"), so seeded history has to
    // land on Mondays too — a run date of "Tuesday" reads as a bug in the
    // rhythm rather than as fixture data.
    const runDate = nextMonday(new Date(Date.now() - fixture.weeksAgo * 7 * DAY_MS));
    const paidAt = new Date(`${runDate}T06:36:00.000Z`); // 09:36 Nairobi, as in the design's copy

    // One transaction per run so a failure part-way leaves no half-cut run
    // holding bookings that can then never be paid.
    const run = await db.transaction((trx) =>
      cutPayoutRun(trx, merchant.id, destination, {
        bookingIds,
        runDate,
        ...(fixture.code ? { markPaid: { providerCode: fixture.code, paidAt } } : {}),
      }),
    );
    if (run) refs.push(run.ref);
  }

  return { created: refs.length, refs };
}

import { db } from "../../db/client.js";
import { getOrCreateMerchant } from "../merchant/service.js";
import { seedDevBookings } from "../bookings/dev-seed.js";
import { seedDevPayouts } from "../payouts/dev-seed.js";
import { notify } from "../../lib/notifications.js";
import { enqueueNotificationDelivery } from "../../jobs/notification-delivery.js";
import type { BookingRow } from "../bookings/db-types.js";
import type { VehicleRow } from "../merchant/db-types.js";
import type { PayoutRunRow } from "../payouts/db-types.js";
import type { NotificationRow } from "./db-types.js";

/**
 * Reproduces the ten feed fixtures from "Cruz Merchant Notifications.dc
 * .html" against real subjects, so the deep links actually go somewhere.
 * Never mounted in production (routes.ts NODE_ENV guard) — there is no
 * customer portal or ops console generating most of these events for real
 * yet, the same footing as the bookings and payouts seeders.
 *
 * Bodies are kept close to the design's demo copy; refs are the *real*
 * seeded refs rather than the mockup's literals, so a chip and the page it
 * opens agree.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface Fixture {
  category: Parameters<typeof notify>[1]["category"];
  title: string;
  body: string;
  agoMs: number;
  read: boolean;
  subject:
    | { type: "booking"; pick: "requested" | "requested-2" | "completed" | "active" }
    | { type: "vehicle"; pick: 0 | 1 | 2 }
    | { type: "payout_run"; pick: "scheduled" | "paid" }
    | { type: "merchant" };
}

const FIXTURES: Fixture[] = [
  {
    category: "booking",
    title: "New booking request",
    body: "A hirer wants one of your vehicles and has already paid CRAL. Answer before the window closes.",
    agoMs: 5 * HOUR,
    read: false,
    subject: { type: "booking", pick: "requested" },
  },
  {
    category: "payout",
    title: "Payout scheduled",
    body: "Your next run goes straight to M-Pesa on Monday. Anything returned before Sunday midnight joins it.",
    agoMs: 6 * HOUR,
    read: false,
    subject: { type: "payout_run", pick: "scheduled" },
  },
  {
    category: "return",
    title: "Vehicle picked up",
    body: "The hirer collected the vehicle. Condition photos are attached to the booking.",
    agoMs: 8 * HOUR,
    read: false,
    subject: { type: "booking", pick: "active" },
  },
  {
    category: "review",
    title: "Logbook rejected",
    body: "The name on the logbook is not yours. Upload a logbook in your name or a signed management agreement.",
    agoMs: DAY + 4 * HOUR,
    read: false,
    subject: { type: "vehicle", pick: 0 },
  },
  {
    category: "rating",
    title: "A hirer rated you 5 out of 5",
    body: '"Car was clean and handover was quick." You have not rated them back yet.',
    agoMs: DAY + 8 * HOUR,
    read: true,
    subject: { type: "booking", pick: "completed" },
  },
  {
    category: "payout",
    title: "Payout sent",
    body: "Finished hires cleared to your M-Pesa. The Safaricom code is on the payout.",
    agoMs: DAY + 12 * HOUR,
    read: true,
    subject: { type: "payout_run", pick: "paid" },
  },
  {
    category: "expiry",
    title: "Insurance expires in 19 days",
    body: "Cover lapses soon. Upload the renewal and the listing keeps taking bookings without a break.",
    agoMs: 2 * DAY,
    read: true,
    subject: { type: "vehicle", pick: 1 },
  },
  {
    category: "review",
    title: "Vehicle is in the review queue",
    body: "Vehicle documents received. Reviews take up to two working days.",
    agoMs: 2 * DAY + 6 * HOUR,
    read: true,
    subject: { type: "vehicle", pick: 2 },
  },
  {
    category: "review",
    title: "Your company documents were accepted",
    body: "Certificate of incorporation, company KRA PIN and director ID are all checked. Vehicles now only need their own three documents.",
    agoMs: 3 * DAY,
    read: true,
    subject: { type: "merchant" },
  },
  {
    category: "booking",
    title: "Corporate booking request",
    body: "A company wants a vehicle with driver for a week. Payment is with CRAL and waiting on your answer.",
    agoMs: 2 * DAY + 2 * HOUR,
    read: false,
    subject: { type: "booking", pick: "requested-2" },
  },
];

export async function seedDevNotifications(userId: string) {
  const merchant = await getOrCreateMerchant(userId);

  // Make sure there are real subjects to point at. `seedDevPayouts` cuts
  // runs, and cutting a run writes its own payout notification — so seed
  // the subjects *first*, then wipe the feed, then lay down exactly the ten
  // fixtures below. That keeps a re-seed deterministic instead of stacking.
  const haveBookings = await db("bookings").where({ merchant_id: merchant.id }).first();
  if (!haveBookings) await seedDevBookings(userId);
  const havePayouts = await db("payout_runs").where({ merchant_id: merchant.id }).first();
  if (!havePayouts) await seedDevPayouts(userId);

  await db("notifications").where({ merchant_id: merchant.id }).delete();

  const bookings = await db<BookingRow>("bookings")
    .where({ merchant_id: merchant.id })
    .orderBy("created_at", "asc");
  const vehicles = await db<VehicleRow>("vehicles")
    .where({ merchant_id: merchant.id })
    .orderBy("created_at", "asc");
  const runs = await db<PayoutRunRow>("payout_runs")
    .where({ merchant_id: merchant.id })
    .orderBy("run_date", "asc");

  const requested = bookings.filter((b) => b.status === "requested");
  const pick = {
    booking: (which: "requested" | "requested-2" | "completed" | "active") => {
      if (which === "requested") return requested[0];
      if (which === "requested-2") return requested[1] ?? requested[0];
      return bookings.find((b) => b.status === which);
    },
    vehicle: (i: 0 | 1 | 2) => vehicles[i] ?? vehicles[vehicles.length - 1],
    run: (which: "scheduled" | "paid") =>
      runs.find((r) => (which === "paid" ? r.status === "paid" : r.status !== "paid")),
  };

  const now = Date.now();
  const createdIds: string[] = [];

  await db.transaction(async (trx) => {
    for (const fixture of FIXTURES) {
      let ref: string | null = null;
      let subjectId: string | null = null;
      let subjectType: NotificationRow["subject_type"] = null;

      if (fixture.subject.type === "booking") {
        const booking = pick.booking(fixture.subject.pick);
        if (booking) {
          ref = booking.ref;
          subjectId = booking.id;
          subjectType = "booking";
        }
      } else if (fixture.subject.type === "vehicle") {
        const vehicle = pick.vehicle(fixture.subject.pick);
        if (vehicle) {
          ref = vehicle.registration;
          subjectId = vehicle.id;
          subjectType = "vehicle";
        }
      } else if (fixture.subject.type === "payout_run") {
        const run = pick.run(fixture.subject.pick);
        if (run) {
          ref = run.ref;
          subjectId = run.id;
          subjectType = "payout_run";
        }
      } else {
        subjectType = "merchant";
      }

      const id = await notify(trx, {
        merchantId: merchant.id,
        category: fixture.category,
        title: fixture.title,
        body: fixture.body,
        ref,
        subjectType,
        subjectId,
        occurredAt: new Date(now - fixture.agoMs),
      });
      createdIds.push(id);

      if (fixture.read) {
        await trx("notifications").where({ id }).update({ read_at: new Date(now - fixture.agoMs + HOUR) });
      }
    }
  });

  await enqueueNotificationDelivery(merchant.id, createdIds);

  return { seeded: createdIds.length };
}

/**
 * Local dev only: wipe one merchant's bookings + payouts fixture data and
 * re-seed both from the dev-seeders, so the portal goes back to a clean,
 * consistent demo state. The seeders stack rather than replace, so without
 * the wipe a re-seed just piles a second set on top of the first.
 *
 *   npm run reset:demo -w apps/api -- <email>
 */
import "../lib/load-env.js";
import { db } from "../db/client.js";
import { seedDevBookings } from "../modules/bookings/dev-seed.js";
import { seedDevPayouts } from "../modules/payouts/dev-seed.js";

const email = process.argv[2];

async function main(): Promise<void> {
  if (!email) throw new Error("Usage: reset-demo-data.ts <merchant email>");
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run in production.");

  const user = await db("users").where({ email }).first("id", "email");
  if (!user) throw new Error(`No user with email ${email}`);
  const merchant = await db("merchants").where({ user_id: user.id }).first("id");
  if (!merchant) throw new Error(`No merchant for ${email}`);
  const merchantId = merchant.id as string;

  const bookingIds = (await db("bookings").where({ merchant_id: merchantId }).select("id")).map(
    (b) => b.id as string,
  );
  const runIds = (await db("payout_runs").where({ merchant_id: merchantId }).select("id")).map(
    (r) => r.id as string,
  );
  // eslint-disable-next-line no-console
  console.log(`Before: ${bookingIds.length} bookings, ${runIds.length} payout runs`);

  await db.transaction(async (trx) => {
    // Payout side first: `payout_run_lines.booking_id` is ON DELETE RESTRICT
    // (a line saying a booking was paid must not outlive that booking), so
    // the lines have to go before the bookings they point at.
    if (runIds.length > 0) {
      await trx("payout_queries").whereIn("payout_run_id", runIds).delete();
      await trx("payout_run_lines").whereIn("payout_run_id", runIds).delete();
      await trx("payout_runs").whereIn("id", runIds).delete();
    }
    if (bookingIds.length > 0) {
      await trx("documents").whereIn("booking_id", bookingIds).delete();
      await trx("booking_reports").whereIn("booking_id", bookingIds).delete();
      await trx("booking_events").whereIn("booking_id", bookingIds).delete();
      await trx("handovers").whereIn("booking_id", bookingIds).delete();
      await trx("bookings").whereIn("id", bookingIds).delete();
    }
    // A notification whose subject has just been deleted still renders an
    // "Open payout ›" link - straight to a 404.
    const subjects = [...bookingIds, ...runIds];
    if (subjects.length > 0) {
      await trx("notifications").where({ merchant_id: merchantId }).whereIn("subject_id", subjects).delete();
    }
  });

  // eslint-disable-next-line no-console
  console.log("Wiped. Re-seeding...");
  const bookings = await seedDevBookings(user.id as string);
  const payouts = await seedDevPayouts(user.id as string);
  // eslint-disable-next-line no-console
  console.log("Bookings seeded:", JSON.stringify(bookings));
  // eslint-disable-next-line no-console
  console.log("Payouts seeded: ", JSON.stringify(payouts));

  const bookingCount = (await db("bookings").where({ merchant_id: merchantId }).count<{ c: string }[]>("id as c"))[0]?.c;
  const runCount = (await db("payout_runs").where({ merchant_id: merchantId }).count<{ c: string }[]>("id as c"))[0]?.c;
  // eslint-disable-next-line no-console
  console.log(`After: ${bookingCount} bookings, ${runCount} payout runs`);
}

main()
  .then(() => db.destroy())
  .catch(async (error: unknown) => {
    console.error(error);
    await db.destroy();
    process.exit(1);
  });

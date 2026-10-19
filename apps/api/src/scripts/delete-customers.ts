/**
 * Local dev only: delete customer (renter) accounts, so a sign-up or
 * booking flow can be walked again from nothing.
 *
 *   npm run customers:delete -w apps/api -- <email>        # one account
 *   npm run customers:delete -w apps/api -- --all          # every renter
 *   npm run customers:delete -w apps/api -- --all --yes    # actually do it
 *
 * **It is a dry run unless `--yes` is passed.** It prints exactly what
 * would go and then stops - this deletes real rows permanently and there
 * is no undo, so the destructive half is never the default.
 *
 * Three things it refuses to do:
 *
 * - **It never runs against production.** `NODE_ENV=production` exits.
 * - **It never touches a merchant or admin account.** `users.roles` is a
 *   flat array, so one row can be both; an account carrying `merchant` or
 *   `admin` is skipped and named, because deleting it would take a whole
 *   fleet, its payouts and its documents with it.
 * - **It never deletes a booking that has been paid out.**
 *   `payout_run_lines.booking_id` is ON DELETE RESTRICT on purpose (a line
 *   saying a merchant was paid must not outlive the booking it was paid
 *   for), so such an account is skipped and named rather than forced.
 *
 * `audit_log` is left entirely alone. It has no foreign key to `users`, it
 * is append-only at the database level (a BEFORE UPDATE OR DELETE trigger,
 * migration 20260905090100), and nothing in this codebase may remove a
 * row from it - including a cleanup script.
 *
 * Stored document bytes are not swept. The `documents` rows go with the
 * user (ON DELETE CASCADE), but the objects behind them stay in whatever
 * storage adapter wrote them; `npm run storage:migrate-b2` is driven off
 * live rows, so orphans there cost space and nothing else.
 */
import "../lib/load-env.js";
import { db } from "../db/client.js";

interface Target {
  id: string;
  email: string;
  full_name: string | null;
  roles: string[];
}

function usage(): never {
  throw new Error("Usage: delete-customers.ts <email> | --all  [--yes]");
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run in production.");

  const args = process.argv.slice(2);
  const confirmed = args.includes("--yes");
  const all = args.includes("--all");
  const email = args.find((a) => !a.startsWith("--"));
  if (!all && !email) usage();

  const rows: Target[] = await db("users")
    .modify((q) => {
      if (email) q.where({ email });
      else q.whereRaw("? = any(roles)", ["customer"]);
    })
    .select("id", "email", "full_name", "roles");

  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log(email ? `No user with email ${email}.` : "No customer accounts found.");
    return;
  }

  const deletable: Target[] = [];
  const skipped: Array<{ target: Target; why: string }> = [];

  for (const user of rows) {
    const roles = user.roles ?? [];
    if (!roles.includes("customer")) {
      skipped.push({ target: user, why: "not a customer account" });
      continue;
    }
    if (roles.includes("merchant") || roles.includes("admin")) {
      skipped.push({ target: user, why: `also ${roles.filter((r) => r !== "customer").join(" + ")}` });
      continue;
    }
    const paidOut = await db("payout_run_lines")
      .join("bookings", "bookings.id", "payout_run_lines.booking_id")
      .where("bookings.hirer_id", user.id)
      .first("payout_run_lines.id");
    if (paidOut) {
      skipped.push({ target: user, why: "has a booking that was already paid out" });
      continue;
    }
    deletable.push(user);
  }

  for (const { target, why } of skipped) {
    // eslint-disable-next-line no-console
    console.log(`  skip  ${target.email} (${why})`);
  }

  for (const user of deletable) {
    const counts = await countsFor(user.id);
    // eslint-disable-next-line no-console
    console.log(
      `  ${confirmed ? "delete" : "would delete"}  ${user.email}` +
        ` - ${counts.bookings} booking(s), ${counts.documents} document(s), ${counts.notifications} notification(s)`,
    );
  }

  if (!confirmed) {
    // eslint-disable-next-line no-console
    console.log(
      `\n${deletable.length} account(s) would be deleted, ${skipped.length} skipped.` +
        " Nothing was changed - re-run with --yes to delete.",
    );
    return;
  }

  for (const user of deletable) {
    await db.transaction(async (trx) => {
      const bookingIds: string[] = (
        await trx("bookings").where({ hirer_id: user.id }).select("id")
      ).map((b) => b.id as string);

      // ratings is ON DELETE RESTRICT from both sides, so it goes first -
      // by the rows this user wrote and the rows written about them.
      await trx("ratings").where({ rater_id: user.id }).orWhere({ ratee_id: user.id }).delete();

      if (bookingIds.length > 0) {
        // Everything hanging off a booking cascades except the payout line
        // checked for above, but the delete is spelled out rather than
        // trusted to cascade order - a surprise here is a half-deleted
        // account, and this runs in one transaction so it is all or none.
        await trx("refunds").whereIn("booking_id", bookingIds).delete();
        await trx("payment_requests").whereIn("booking_id", bookingIds).delete();
        await trx("handovers").whereIn("booking_id", bookingIds).delete();
        await trx("booking_reports").whereIn("booking_id", bookingIds).delete();
        await trx("booking_events").whereIn("booking_id", bookingIds).delete();
        await trx("documents").whereIn("booking_id", bookingIds).delete();
        // The merchant's own feed still points at bookings that are about
        // to stop existing - an "Open booking ›" straight to a 404.
        await trx("notifications").whereIn("subject_id", bookingIds).delete();
        await trx("bookings").whereIn("id", bookingIds).delete();
      }

      await trx("otp_codes").where({ identifier: user.email }).delete();
      // sessions, documents, notifications, password_reset_tokens,
      // recovery_codes and two_factor_challenges are all ON DELETE CASCADE.
      await trx("users").where({ id: user.id }).delete();
    });
    // eslint-disable-next-line no-console
    console.log(`  deleted ${user.email}`);
  }

  // eslint-disable-next-line no-console
  console.log(`\nDeleted ${deletable.length} account(s), skipped ${skipped.length}.`);
}

async function countsFor(userId: string) {
  const [bookings, documents, notifications] = await Promise.all([
    db("bookings").where({ hirer_id: userId }).count<{ count: string }[]>("id as count"),
    db("documents").where({ user_id: userId }).count<{ count: string }[]>("id as count"),
    db("notifications").where({ user_id: userId }).count<{ count: string }[]>("id as count"),
  ]);
  return {
    bookings: Number(bookings[0]?.count ?? 0),
    documents: Number(documents[0]?.count ?? 0),
    notifications: Number(notifications[0]?.count ?? 0),
  };
}

main()
  .then(() => db.destroy())
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    await db.destroy();
    process.exitCode = 1;
  });

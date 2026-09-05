import "../lib/load-env.js";
import { runDailyReminderSweep } from "../modules/merchant/service.js";
import { db } from "../db/client.js";

/**
 * `npm run reminders:sweep -w apps/api` — runs the stalled-onboarding
 * reminder sweep once, immediately, without going through BullMQ's
 * scheduler. This is the manual-trigger verification path: seed a
 * merchant row with a `last_activity_at` in the past, run this, and
 * confirm the email renders (EMAIL_ADAPTER=console prints it to stdout)
 * and a merchant_onboarding_reminders row lands.
 */
async function main(): Promise<void> {
  // The sweep has grown well past reminders — it also generates expiry
  // notices, purges notifications past 90 days, finishes scheduled account
  // deletions and collects expired idempotency keys. Report all of it, or
  // running this by hand tells you almost nothing about what it just did.
  const result = await runDailyReminderSweep();
  // eslint-disable-next-line no-console
  console.log(
    [
      "Daily sweep complete:",
      `  reminder emails sent        ${result.sent}`,
      `  insurance expiry notices    ${result.expiryNotices}`,
      `  notifications purged        ${result.purged}`,
      `  accounts deleted            ${result.accountsDeleted}`,
      `  idempotency keys purged     ${result.idempotencyKeysPurged}`,
    ].join("\n"),
  );
  await db.destroy();
}

main().catch((error: unknown) => {
  console.error("Reminder sweep failed:", error);
  process.exit(1);
});

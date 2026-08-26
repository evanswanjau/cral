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
  const { sent } = await runDailyReminderSweep();
  // eslint-disable-next-line no-console
  console.log(`Reminder sweep complete — ${sent} email(s) sent.`);
  await db.destroy();
}

main().catch((error: unknown) => {
  console.error("Reminder sweep failed:", error);
  process.exit(1);
});

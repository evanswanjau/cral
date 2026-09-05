import "./lib/load-env.js";
import type { Worker } from "bullmq";
import { createApp } from "./app.js";
import { db } from "./db/client.js";
import { redis } from "./lib/redis.js";
import { emailAdapter, smsAdapter } from "./lib/adapters.js";
import { SmtpEmailAdapter } from "./adapters/email/index.js";
import { TextSmsAdapter } from "./adapters/sms/index.js";
import { scheduleRepeatable, startMerchantReminderWorker } from "./jobs/merchant-reminders.js";
import { scheduleBookingExpirySweep, startBookingExpiryWorker } from "./jobs/booking-expiry.js";
import { startNotificationDeliveryWorker } from "./jobs/notification-delivery.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${port}`);
});

// Runs inside the main process rather than a separate worker deployable —
// this is a solo-built, not-yet-deployed single-service project (DEPLOY.md),
// so a second process is infrastructure it doesn't need yet. `server.ts` is
// never imported by tests (only app.ts's createApp() is), so this guard is
// defense-in-depth, not the only thing keeping it out of the test run.
const workers: Worker[] = [];

if (process.env.NODE_ENV !== "test") {
  void scheduleRepeatable();
  workers.push(startMerchantReminderWorker());
  void scheduleBookingExpirySweep();
  workers.push(startBookingExpiryWorker());
  workers.push(startNotificationDeliveryWorker());
}

/**
 * Shut down in the order that loses the least work.
 *
 * A platform deploy sends SIGTERM and then kills the process a short while
 * later. Without this, that kill lands on whatever was in flight: a request
 * halfway through a transaction, and BullMQ jobs a worker had claimed but
 * not acknowledged, which then sit until their lock expires.
 *
 * Stop taking new connections first, let the open ones finish, then close
 * the workers (each drains its active job), and only then drop the
 * connections everything else is using.
 */
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  // A second SIGTERM (or an impatient Ctrl-C) shouldn't restart the
  // sequence and race the first one.
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`[api] ${signal} received — draining`);

  const forceExit = setTimeout(() => {
    console.warn("[api] drain took too long — exiting anyway");
    process.exit(1);
  }, 15_000);
  // Don't let the timer itself hold the process open once we're done.
  forceExit.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await Promise.all(workers.map((worker) => worker.close()));
    await db.destroy();
    redis.disconnect();
    // eslint-disable-next-line no-console
    console.log("[api] drained cleanly");
    process.exit(0);
  } catch (error) {
    console.error("[api] error while shutting down:", error);
    process.exit(1);
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => void shutdown(signal));
}

// Prove the mail path at boot rather than the first time someone registers
// and their verification code silently never arrives. A warning, not a
// fatal: the rest of the API is still worth serving if mail is down.
if (emailAdapter instanceof SmtpEmailAdapter) {
  void emailAdapter.verify().then(
    () => {
      // eslint-disable-next-line no-console
      console.log(`[api] smtp ready — ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
    },
    (error: unknown) => {
      console.warn(`[api] smtp NOT ready — ${(error as Error).message}`);
    },
  );
}

// TextSMS has no auth-only endpoint to probe; a missing credential already
// throws from the adapter constructor at boot. Just say which path is live
// so a `console` adapter in a real deployment is obvious in the logs.
if (smsAdapter instanceof TextSmsAdapter) {
  // eslint-disable-next-line no-console
  console.log(`[api] sms ready — textsms (sender ${process.env.TEXTSMS_SHORTCODE})`);
} else if (process.env.NODE_ENV === "production") {
  console.warn("[api] sms adapter is 'console' in production — no SMS will be delivered");
}

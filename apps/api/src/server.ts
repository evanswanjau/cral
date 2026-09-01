import "./lib/load-env.js";
import { createApp } from "./app.js";
import { emailAdapter, smsAdapter } from "./lib/adapters.js";
import { SmtpEmailAdapter } from "./adapters/email/index.js";
import { TextSmsAdapter } from "./adapters/sms/index.js";
import { scheduleRepeatable, startMerchantReminderWorker } from "./jobs/merchant-reminders.js";
import { scheduleBookingExpirySweep, startBookingExpiryWorker } from "./jobs/booking-expiry.js";
import { startNotificationDeliveryWorker } from "./jobs/notification-delivery.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${port}`);
});

// Runs inside the main process rather than a separate worker deployable —
// this is a solo-built, not-yet-deployed single-service project (DEPLOY.md),
// so a second process is infrastructure it doesn't need yet. `server.ts` is
// never imported by tests (only app.ts's createApp() is), so this guard is
// defense-in-depth, not the only thing keeping it out of the test run.
if (process.env.NODE_ENV !== "test") {
  void scheduleRepeatable();
  startMerchantReminderWorker();
  void scheduleBookingExpirySweep();
  startBookingExpiryWorker();
  startNotificationDeliveryWorker();
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

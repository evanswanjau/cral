import { Queue, Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { sharedWorkerOptions } from "./queue.js";
import { db } from "../db/client.js";
import { smsAdapter, emailAdapter } from "../lib/adapters.js";
import { emailHeading, emailLayout, emailMuted, emailParagraph } from "../lib/email-templates.js";
import {
  NOTIFICATION_CATEGORIES,
  categoryLocksSms,
} from "../lib/notifications.js";
import type { NotificationRow, NotificationPreferenceRow } from "../modules/notifications/db-types.js";

/**
 * Fans a written notification out to SMS and email per the merchant's
 * preferences. Same plumbing shape as jobs/booking-expiry.ts and
 * jobs/merchant-reminders.ts — jobs/queue.ts's own comment already named
 * "notifications" as the next queue.
 *
 * `payout` and `review` always send by SMS, whatever the preference says
 * (`categoryLocksSms`).
 *
 * SMS also requires `users.phone_verified` — texting an unverified number
 * is the exact failure mode onboarding phone verification exists to stop.
 */

const QUEUE_NAME = "notification-delivery";
const JOB_NAME = "deliver-notification";

export const notificationDeliveryQueue = new Queue(QUEUE_NAME, { connection: redis });

interface DeliverJobData {
  notificationId: string;
}

/**
 * Enqueues delivery for freshly written notifications. Call **after** the
 * transaction that wrote them has committed. No-ops on an empty list, and
 * swallows a Redis hiccup: the in-app feed row is already durable, so a
 * failed enqueue costs the merchant a text, not the notification.
 */
export async function enqueueNotificationDelivery(
  merchantId: string,
  notificationIds: string[],
): Promise<void> {
  if (notificationIds.length === 0) return;

  try {
    await notificationDeliveryQueue.addBulk(
      notificationIds.map((id) => ({
        name: JOB_NAME,
        data: { notificationId: id } satisfies DeliverJobData,
        opts: {
          jobId: `deliver-${id}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: 500,
          removeOnFail: 200,
        },
      })),
    );
  } catch (error) {
    console.error("notification delivery enqueue failed", { merchantId, notificationIds, error });
  }
}

/**
 * The renter-side counterpart of `enqueueNotificationDelivery`. Same
 * post-commit rule, same swallowed-Redis-hiccup reasoning. See
 * `RENTER_CHANNELS`.
 */
export async function enqueueRenterNotificationDelivery(
  notificationIds: string[],
): Promise<void> {
  if (notificationIds.length === 0) return;
  try {
    await notificationDeliveryQueue.addBulk(
      notificationIds.map((id) => ({
        name: JOB_NAME,
        data: { notificationId: id } satisfies DeliverJobData,
        opts: {
          jobId: `deliver-${id}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: 500,
          removeOnFail: 200,
        },
      })),
    );
  } catch (error) {
    console.error("renter notification delivery enqueue failed", { notificationIds, error });
  }
}

async function resolvePreference(
  merchantId: string,
  category: NotificationRow["category"],
): Promise<{ sms: boolean; email: boolean }> {
  const row = await db<NotificationPreferenceRow>("notification_preferences")
    .where({ merchant_id: merchantId, category })
    .first();
  const meta = NOTIFICATION_CATEGORIES[category];
  const sms = row ? row.sms : meta.default.sms;
  const email = row ? row.email : meta.default.email;
  return {
    // A locked channel is always on, whatever the stored row says.
    sms: sms || categoryLocksSms(category),
    email,
  };
}

/**
 * A renter's channels. Fixed rather than configurable: there is no renter
 * Settings screen, and every renter-facing notification this product
 * writes today is transactional (your request was accepted, declined, a
 * pickup code is on its way).
 *
 * The `phone_verified` gate below still applies, which is why a renter's
 * phone is verified at the booking-request step.
 */
const RENTER_CHANNELS = { sms: true, email: true } as const;

/** Exported for the tests — resolves preferences, applies the phone-verified gate, sends. */
export async function deliverNotification({ notificationId }: DeliverJobData): Promise<void> {
  const notification = await db<NotificationRow>("notifications").where({ id: notificationId }).first();
  if (!notification) return;
  // Two audiences reach this queue now. A merchant row resolves its
  // channels from that merchant's own Alerts matrix; a
  // renter row (Migration B, `user_id`) has no Settings screen to
  // configure, so it carries the fixed policy below (owner's call,
  // 2026-09-19 — a renter must be *texted* when an owner accepts, because
  // that is the moment the hire becomes real and payment is due).
  let userId: string | null = null;
  let pref: { sms: boolean; email: boolean };

  if (notification.merchant_id) {
    const merchant = await db("merchants").where({ id: notification.merchant_id }).first("user_id");
    if (!merchant) return;
    userId = merchant.user_id as string;
    pref = await resolvePreference(notification.merchant_id, notification.category);
  } else if (notification.user_id) {
    userId = notification.user_id;
    pref = RENTER_CHANNELS;
  } else {
    return;
  }

  const user = await db("users").where({ id: userId }).first("email", "phone", "phone_verified");
  if (!user) return;

  // Each channel is isolated, and the job only fails when *nothing* got
  // through. The job has `attempts: 3`, and SMS runs first — so letting an
  // email failure bubble would retry the whole body and send a second,
  // billable text. Retrying is only safe when no channel delivered, which
  // is also the case that most needs it (provider or network outage).
  //
  // A retry isn't only `attempts` here, though — BullMQ's own stalled-job
  // recovery redelivers a job whose worker died mid-run without acking
  // (any ungraceful process restart, e.g. `tsx watch` picking up a file
  // save during dev, or a real crash/redeploy in production), independent
  // of the `attempts` counter. `notification.sms_sent_at`/`email_sent_at`
  // are what make that safe: a channel already marked sent is skipped
  // rather than re-attempted, so a redelivered job costs a second no-op
  // pass, not a second real text landing on someone's phone.
  let attempted = 0;
  let delivered = 0;

  if (pref.sms && user.phone && user.phone_verified) {
    if (notification.sms_sent_at) {
      delivered++;
    } else {
      attempted++;
      try {
        const ref = notification.ref ? ` (${notification.ref})` : "";
        await smsAdapter.send({
          to: user.phone as string,
          body: `CRAL: ${notification.title}${ref}. ${notification.body}`.slice(0, 320),
        });
        await db("notifications").where({ id: notificationId }).update({ sms_sent_at: new Date() });
        delivered++;
      } catch (error) {
        console.error("notification sms failed", { notificationId, error });
      }
    }
  }

  if (pref.email && user.email) {
    if (notification.email_sent_at) {
      delivered++;
    } else {
      attempted++;
      try {
        await emailAdapter.send({
          to: user.email as string,
          subject: notification.title,
          html: emailLayout({
            preheader: notification.body,
            bodyHtml: [
              emailHeading(notification.title),
              emailParagraph(escapeHtml(notification.body)),
              notification.ref ? emailMuted(`Reference: ${escapeHtml(notification.ref)}`) : "",
            ].join(""),
          }),
          text: `${notification.title}\n\n${notification.body}${notification.ref ? `\n\nReference: ${notification.ref}` : ""}`,
        });
        await db("notifications").where({ id: notificationId }).update({ email_sent_at: new Date() });
        delivered++;
      } catch (error) {
        console.error("notification email failed", { notificationId, error });
      }
    }
  }

  if (attempted > 0 && delivered === 0) {
    throw new Error(`notification ${notificationId}: every channel failed`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function startNotificationDeliveryWorker(): Worker {
  return new Worker<DeliverJobData>(
    QUEUE_NAME,
    async (job) => {
      await deliverNotification(job.data);
    },
    { connection: redis, ...sharedWorkerOptions },
  );
}

import { Queue, Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { runDailyReminderSweep } from "../modules/merchant/service.js";

const QUEUE_NAME = "merchant-onboarding-reminders";
const JOB_NAME = "check-stalled-onboarding";

/**
 * Plumbing only — same shape as jobs/queue.ts's placeholder ping queue.
 * Business logic (tier computation, email content) lives in
 * modules/merchant/service.ts, which needs the same row types as the rest
 * of that module.
 */
export const merchantReminderQueue = new Queue(QUEUE_NAME, { connection: redis });

/**
 * Registers the "run once a day at 10:00 Nairobi time" repeatable job.
 * `jobId` is stable so re-calling this on every boot doesn't stack up
 * duplicate repeatable schedules.
 */
export async function scheduleRepeatable(): Promise<void> {
  await merchantReminderQueue.add(
    JOB_NAME,
    {},
    {
      repeat: { pattern: "0 10 * * *", tz: "Africa/Nairobi" },
      jobId: JOB_NAME,
    },
  );
}

export function startMerchantReminderWorker(): Worker {
  return new Worker(
    QUEUE_NAME,
    async () => {
      await runDailyReminderSweep();
    },
    { connection: redis },
  );
}

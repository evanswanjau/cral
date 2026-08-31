import { Queue, Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { expireStaleBookingRequests } from "../modules/bookings/service.js";

const QUEUE_NAME = "booking-request-expiry";
const JOB_NAME = "expire-stale-requests";

/**
 * Sweeps `requested` bookings past their 12h response window (spec §14)
 * to `expired`. Same plumbing shape as jobs/merchant-reminders.ts — every
 * 15 minutes is frequent enough that a hirer's refund-on-expiry never
 * lags more than a few minutes behind the actual deadline.
 */
export const bookingExpiryQueue = new Queue(QUEUE_NAME, { connection: redis });

export async function scheduleBookingExpirySweep(): Promise<void> {
  await bookingExpiryQueue.add(
    JOB_NAME,
    {},
    {
      repeat: { every: 15 * 60 * 1000 },
      jobId: JOB_NAME,
    },
  );
}

export function startBookingExpiryWorker(): Worker {
  return new Worker(
    QUEUE_NAME,
    async () => {
      await expireStaleBookingRequests();
    },
    { connection: redis },
  );
}

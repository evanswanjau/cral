import { Queue, Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { sharedWorkerOptions } from "./queue.js";
import { reconcilePendingCoopPayments } from "../modules/payments/status-sweep.js";
import { reconcileDisbursements } from "../lib/disbursements.js";

const QUEUE_NAME = "payment-status-sweep";
const JOB_NAME = "reconcile-pending-coop-payments";

/**
 * Every 5 minutes, ask Co-op about STK requests and outgoing transfers
 * whose callback hasn't landed - see modules/payments/status-sweep.ts and
 * lib/disbursements.ts#reconcileDisbursements. Same plumbing shape as
 * jobs/booking-expiry.ts. A no-op where Co-op isn't configured.
 */
export const paymentStatusQueue = new Queue(QUEUE_NAME, { connection: redis });

export async function schedulePaymentStatusSweep(): Promise<void> {
  await paymentStatusQueue.add(
    JOB_NAME,
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      jobId: JOB_NAME,
    },
  );
}

export function startPaymentStatusWorker(): Worker {
  return new Worker(
    QUEUE_NAME,
    async () => {
      await reconcilePendingCoopPayments();
      await reconcileDisbursements();
    },
    { connection: redis, ...sharedWorkerOptions },
  );
}

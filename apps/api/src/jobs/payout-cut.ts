import { Queue, Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { sharedWorkerOptions } from "./queue.js";
import { cutDuePayoutRuns } from "../modules/payouts/schedule.js";

const QUEUE_NAME = "payout-cut";
const JOB_NAME = "cut-due-payout-runs";

/**
 * Cuts the day's due payout runs at 06:00 Nairobi - see
 * modules/payouts/schedule.ts. Cutting is not paying: each run waits as
 * `scheduled` until Finance presses Pay in Ops.
 */
export const payoutCutQueue = new Queue(QUEUE_NAME, { connection: redis });

export async function schedulePayoutCut(): Promise<void> {
  await payoutCutQueue.add(
    JOB_NAME,
    {},
    {
      repeat: { pattern: "0 6 * * *", tz: "Africa/Nairobi" },
      jobId: JOB_NAME,
    },
  );
}

export function startPayoutCutWorker(): Worker {
  return new Worker(
    QUEUE_NAME,
    async () => {
      await cutDuePayoutRuns();
    },
    { connection: redis, ...sharedWorkerOptions },
  );
}

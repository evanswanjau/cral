import { Queue, Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { sharedWorkerOptions } from "./queue.js";
import { autoConfirmReadyOrders } from "../modules/garage/orders.js";

const QUEUE_NAME = "garage-order-confirm";
const JOB_NAME = "auto-confirm-ready-orders";

/**
 * Confirms garage orders that have been `ready` for 72 h with no problem
 * raised (Phase 4 GS3, owner decision 7). Every 15 minutes, the
 * booking-expiry cadence: a garage waits at most a quarter of an hour past
 * the window for its money to become payable.
 */
export const garageOrderConfirmQueue = new Queue(QUEUE_NAME, { connection: redis });

export async function scheduleGarageOrderConfirmSweep(): Promise<void> {
  await garageOrderConfirmQueue.add(JOB_NAME, {}, { repeat: { every: 15 * 60 * 1000 }, jobId: JOB_NAME });
}

export function startGarageOrderConfirmWorker(): Worker {
  return new Worker(
    QUEUE_NAME,
    async () => {
      await autoConfirmReadyOrders();
    },
    { connection: redis, ...sharedWorkerOptions },
  );
}

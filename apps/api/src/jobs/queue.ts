import { Queue, type WorkerOptions } from "bullmq";
import { redis } from "../lib/redis.js";

export { redis as redisConnection };

/**
 * Placeholder queue proving the BullMQ pipe works end to end. Real job
 * queues get their own Queue + Worker as the phase that needs them is
 * built — merchant-reminders, booking-expiry and notification-delivery
 * already have theirs; payout runs are still to come.
 */
export const pingQueue = new Queue("ping", { connection: redis });

/**
 * Shared worker options, and the reason they exist.
 *
 * BullMQ's defaults poll hard: `drainDelay` 5s (a blocking pop that
 * re-issues every 5s per worker) and `stalledInterval` 30s (a Lua
 * stalled-job sweep, the `evalsha` in the crash logs). With four workers
 * that is roughly 150k Redis commands a day at ZERO traffic - which
 * exhausted Upstash's free-tier 500k monthly cap in about three days and
 * took the whole API down with it, twice.
 *
 * These are queues where nothing is time-critical: reminders and the
 * expiry sweep are daily, notification delivery tolerates a minute. So
 * the intervals are raised by an order of magnitude, cutting idle usage
 * to roughly 10k commands a day.
 *
 * `WORKERS_ENABLED=false` skips starting them altogether - for a
 * deployment that only needs to serve HTTP (the demo box) and should not
 * spend its Redis quota on sweeps nobody is watching.
 */
export const sharedWorkerOptions: Pick<WorkerOptions, "drainDelay" | "stalledInterval"> = {
  drainDelay: 60,
  stalledInterval: 300_000,
};

export function workersEnabled(): boolean {
  return process.env.WORKERS_ENABLED !== "false";
}

import { Queue } from "bullmq";
import { redis } from "../lib/redis.js";

export { redis as redisConnection };

/**
 * Placeholder queue proving the BullMQ pipe works end to end. Real job
 * queues (notifications, payout runs, verification reminders, ...) get
 * their own Queue + Worker as the phase that needs them is built.
 */
export const pingQueue = new Queue("ping", { connection: redis });

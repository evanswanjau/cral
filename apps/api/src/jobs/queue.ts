import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const redisConnection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

/**
 * Placeholder queue proving the BullMQ pipe works end to end. Real job
 * queues (notifications, payout runs, verification reminders, ...) get
 * their own Queue + Worker as the phase that needs them is built.
 */
export const pingQueue = new Queue("ping", { connection: redisConnection });

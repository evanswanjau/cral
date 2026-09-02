import { Queue } from "bullmq";
import { redis } from "../lib/redis.js";

export { redis as redisConnection };

/**
 * Placeholder queue proving the BullMQ pipe works end to end. Real job
 * queues get their own Queue + Worker as the phase that needs them is
 * built — merchant-reminders, booking-expiry and notification-delivery
 * already have theirs; payout runs are still to come.
 */
export const pingQueue = new Queue("ping", { connection: redis });

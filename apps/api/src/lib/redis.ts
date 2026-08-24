import { Redis } from "ioredis";

/** Single shared connection — BullMQ queues, rate limiting, and anything else all reuse this. */
export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380", {
  maxRetriesPerRequest: null,
});

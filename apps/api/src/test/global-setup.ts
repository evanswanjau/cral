import { Redis } from "ioredis";
import "../lib/load-env.js";

/**
 * Clears the rate-limit buckets before the suite runs.
 *
 * The auth tests deliberately hit real endpoints against a persistent local
 * Redis and Postgres, and the buckets are hour-long fixed windows — so
 * running the suite a few times in one sitting will exhaust `register`
 * (10/h) and fail tests for reasons that have nothing to do with the code.
 * Only `ratelimit:*` keys are touched; queues and anything else are left
 * alone.
 */
export async function setup(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380", {
    maxRetriesPerRequest: null,
  });
  const keys = await redis.keys("ratelimit:*");
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();
}

import { Redis } from "ioredis";

/** Single shared connection — BullMQ queues, rate limiting, and anything else all reuse this. */
export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380", {
  maxRetriesPerRequest: null,
});

/**
 * **An `error` listener here is not optional, it is what keeps the API
 * alive.**
 *
 * ioredis emits `error` on the client, and Node rethrows an EventEmitter
 * `error` event that has no listener as an uncaught exception - which
 * kills the process. That is precisely how the Railway deployment died,
 * twice: Upstash's free-tier 500k monthly command cap was exhausted by
 * idle BullMQ polling, every command began returning
 * `ReplyError: ERR max requests limit exceeded`, and the API crash-looped
 * and 502'd on *every* path - including the ones that never touch Redis
 * at all.
 *
 * With this listener a Redis outage is degraded, not fatal: HTTP keeps
 * being served, the database is untouched, and only the things that
 * genuinely need Redis (background jobs, rate-limit counters) stop
 * working. See `middleware/rate-limit.ts`, which fails open for the same
 * reason.
 */
let lastErrorLoggedAt = 0;
redis.on("error", (error: unknown) => {
  // Throttled to one line per 10s. A dead or quota-exhausted Redis emits
  // continuously, and unthrottled it buries every other log line - which
  // is how the real cause stayed hidden behind pages of BullMQ Lua source
  // the first time this happened.
  const now = Date.now();
  if (now - lastErrorLoggedAt < 10_000) return;
  lastErrorLoggedAt = now;
  console.error(`[redis] ${error instanceof Error ? error.message : String(error)}`);
});

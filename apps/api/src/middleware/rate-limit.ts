import type { NextFunction, Request, Response } from "express";
import { ApiError } from "@cral/types";
import { redis } from "../lib/redis.js";

/**
 * Fixed-window rate limiter backed by Redis. Auth and OTP endpoints get
 * their own tighter buckets per spec §2 — this is deliberately simple
 * (fixed window, not sliding) since the numbers in the spec are opening
 * positions to revisit after real traffic (spec §28), not a promise of
 * precision.
 */
export interface RateLimitOptions {
  /** Redis key namespace, e.g. "otp_request". */
  bucket: string;
  limit: number;
  windowSeconds: number;
  /** How to derive the rate-limited identity from the request — defaults to IP. */
  keyFn?: (req: Request) => string;
}

/**
 * The test run bypasses rate limiting unless a test explicitly asks for it.
 *
 * The buckets are Redis-backed and keyed on `req.ip`, and every test request
 * comes from 127.0.0.1 — so all four vitest forks and all the suites inside
 * them shared one bucket per route. `onboarding_upload` allows 60 an hour,
 * and as the suite grew a single full run began uploading more documents
 * than that, at which point unrelated tests started failing with a 429 they
 * never mention. Flushing Redis between runs did not help: one run alone
 * crosses the limit.
 *
 * Nothing is lost by bypassing it here, because no test ever asserted the
 * limiter's behaviour through these routes. It is covered directly instead,
 * in `__tests__/rate-limit.test.ts`, which sets `RATE_LIMIT_IN_TEST=1`.
 *
 * Read from the environment per request, not at module load, so that test
 * can turn it on after the middleware has been imported.
 */
function bypassedForTests(): boolean {
  return process.env.NODE_ENV === "test" && process.env.RATE_LIMIT_IN_TEST !== "1";
}

export function rateLimit(options: RateLimitOptions) {
  const keyFn = options.keyFn ?? ((req: Request) => req.ip ?? "unknown");

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (bypassedForTests()) {
      next();
      return;
    }

    const identity = keyFn(req);
    const windowStart = Math.floor(Date.now() / 1000 / options.windowSeconds);
    const key = `ratelimit:${options.bucket}:${identity}:${windowStart}`;

    /**
     * **Fails open when Redis is unreachable.** The counters live in
     * Redis, and these buckets sit in front of sign-in, OTP requests and
     * password reset - so an unavailable Redis used to mean every one of
     * those endpoints threw a 500 and nobody could sign in at all. That
     * happened for real on Railway when Upstash's free-tier command cap
     * was exhausted (see lib/redis.ts).
     *
     * Letting the request through is the lesser evil, and it is the
     * conventional choice for a limiter: the alternative is that losing
     * a cache takes authentication down with it. It is a genuine
     * trade-off though, not a free win - while Redis is down these
     * endpoints are unthrottled, so the outage is logged loudly rather
     * than swallowed silently.
     */
    let count: number;
    try {
      count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, options.windowSeconds);
      }
    } catch (error) {
      console.error(
        `[rate-limit] bucket "${options.bucket}" failing open - Redis unavailable: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      next();
      return;
    }

    const remaining = Math.max(0, options.limit - count);
    res.setHeader("Cral-RateLimit-Limit", options.limit);
    res.setHeader("Cral-RateLimit-Remaining", remaining);

    if (count > options.limit) {
      // Best-effort: the bucket is already over limit, so a failed TTL
      // read must not turn a 429 into a 500.
      const ttl = await redis.ttl(key).catch(() => options.windowSeconds);
      res.setHeader("Retry-After", Math.max(ttl, 1));
      next(
        new ApiError({
          status: 429,
          type: "rate_limited",
          code: "rate_limited",
          message: "Too many requests. Please try again shortly.",
        }),
      );
      return;
    }

    next();
  };
}

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

export function rateLimit(options: RateLimitOptions) {
  const keyFn = options.keyFn ?? ((req: Request) => req.ip ?? "unknown");

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identity = keyFn(req);
    const windowStart = Math.floor(Date.now() / 1000 / options.windowSeconds);
    const key = `ratelimit:${options.bucket}:${identity}:${windowStart}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, options.windowSeconds);
    }

    const remaining = Math.max(0, options.limit - count);
    res.setHeader("Cral-RateLimit-Limit", options.limit);
    res.setHeader("Cral-RateLimit-Remaining", remaining);

    if (count > options.limit) {
      const ttl = await redis.ttl(key);
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

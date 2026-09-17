import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { ulid } from "ulid";
import { ApiError } from "@cral/types";
import { rateLimit } from "../rate-limit.js";
import { redis } from "../../lib/redis.js";

/**
 * The limiter's own tests.
 *
 * Every other suite runs with rate limiting bypassed — see the comment on
 * `bypassedForTests` in `../rate-limit.ts` for why. That bypass is only safe
 * if the behaviour is covered somewhere, and this is that somewhere: it sets
 * `RATE_LIMIT_IN_TEST=1` so the middleware runs for real against Redis.
 *
 * A bare Express app, not `createApp()`, so nothing here depends on a route's
 * current limit — those numbers are opening positions to revisit after real
 * traffic (spec §28) and this file must not become the reason they are hard
 * to change.
 */

const previous = process.env.RATE_LIMIT_IN_TEST;
const buckets: string[] = [];

beforeAll(() => {
  process.env.RATE_LIMIT_IN_TEST = "1";
});

afterAll(async () => {
  if (previous === undefined) delete process.env.RATE_LIMIT_IN_TEST;
  else process.env.RATE_LIMIT_IN_TEST = previous;

  for (const bucket of buckets) {
    const keys = await redis.keys(`ratelimit:${bucket}:*`);
    if (keys.length > 0) await redis.del(...keys);
  }
});

/**
 * A one-route app behind the limiter. Each call gets its own bucket name, so
 * tests never share a window with each other however they are scheduled.
 */
function appWith(options: { limit: number; windowSeconds?: number; keyFn?: (req: express.Request) => string }) {
  const bucket = `test_${ulid()}`;
  buckets.push(bucket);

  const app = express();
  app.get(
    "/thing",
    rateLimit({
      bucket,
      limit: options.limit,
      windowSeconds: options.windowSeconds ?? 3600,
      // Spread rather than pass `undefined`: the tsconfig sets
      // `exactOptionalPropertyTypes`, so an absent key and an undefined one
      // are not the same thing.
      ...(options.keyFn ? { keyFn: options.keyFn } : {}),
    }),
    (_req, res) => {
      res.status(200).json({ ok: true });
    },
  );
  // The real error handler lives in middleware/error-handler.ts and is tested
  // there; this only needs the status and code the limiter hands it.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code } });
      return;
    }
    res.status(500).json({ error: { code: "unknown" } });
  });
  return app;
}

describe("the fixed-window rate limiter", () => {
  it("lets requests through up to the limit, then answers 429", async () => {
    const app = appWith({ limit: 3 });

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app).get("/thing");
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get("/thing");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("rate_limited");
  });

  it("counts down the remaining allowance, and tells a blocked caller when to retry", async () => {
    const app = appWith({ limit: 2 });

    const first = await request(app).get("/thing");
    expect(first.headers["cral-ratelimit-limit"]).toBe("2");
    expect(first.headers["cral-ratelimit-remaining"]).toBe("1");

    const second = await request(app).get("/thing");
    expect(second.headers["cral-ratelimit-remaining"]).toBe("0");

    const blocked = await request(app).get("/thing");
    // Never negative — the header is advice to a client, not a running total.
    expect(blocked.headers["cral-ratelimit-remaining"]).toBe("0");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("gives each identity its own allowance", async () => {
    // Every test request comes from 127.0.0.1, so the default IP key would put
    // them all in one bucket. This is the `keyFn` case: two callers, one route.
    const app = appWith({
      limit: 1,
      keyFn: (req) => String(req.headers["x-who"] ?? "nobody"),
    });

    expect((await request(app).get("/thing").set("x-who", "ann")).status).toBe(200);
    expect((await request(app).get("/thing").set("x-who", "ann")).status).toBe(429);

    // Ann being over her limit says nothing about Bilal.
    expect((await request(app).get("/thing").set("x-who", "bilal")).status).toBe(200);
  });

  it("opens a fresh allowance when the window rolls over", async () => {
    // A one-second window, so the rollover is real rather than mocked: the key
    // is derived from the wall clock, and this proves that derivation works.
    const app = appWith({ limit: 1, windowSeconds: 1 });

    expect((await request(app).get("/thing")).status).toBe(200);
    expect((await request(app).get("/thing")).status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect((await request(app).get("/thing")).status).toBe(200);
  });

  it("is bypassed by default in the test run, so unrelated suites never see a 429", async () => {
    // The guard the other 29 files depend on. Without it, a long suite's
    // uploads exhaust a shared bucket and tests that never mention rate
    // limiting start failing.
    delete process.env.RATE_LIMIT_IN_TEST;
    try {
      const app = appWith({ limit: 1 });
      for (let i = 0; i < 5; i += 1) {
        expect((await request(app).get("/thing")).status).toBe(200);
      }
    } finally {
      process.env.RATE_LIMIT_IN_TEST = "1";
    }
  });
});

import { Router } from "express";
import { db } from "../db/client.js";
import { redisConnection } from "../jobs/queue.js";

export const healthRouter = Router();

/** Liveness — the process is up. No dependency checks. */
healthRouter.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

/** Readiness — the process is up AND can reach its dependencies. */
healthRouter.get("/readyz", async (_req, res) => {
  const checks: Record<string, "ok" | "down"> = { database: "down", redis: "down" };

  try {
    await db.raw("select 1");
    checks.database = "ok";
  } catch {
    // left as "down"
  }

  try {
    await redisConnection.ping();
    checks.redis = "ok";
  } catch {
    // left as "down"
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  res.status(allOk ? 200 : 503).json({ status: allOk ? "ok" : "degraded", checks });
});

/*
 * There was a `GET /audit-log` here — Phase-0 scaffolding that read the
 * audit table back to prove cursor pagination, the shared envelope and the
 * table itself all worked end to end. It was mounted on the health router
 * with no `authenticate()`, so by the time the merchant portal was carrying
 * real accounts it was an anonymous, cursor-walkable dump of every state
 * change on the platform: actor ids, IPs, and the before/after JSONB.
 *
 * Removed 2026-09-03. What it was proving is now covered properly by the
 * module test suites. An audit reader for humans belongs in the Phase-3
 * admin surface, behind an `aud: "ops"` token — not here, and never
 * unauthenticated.
 */

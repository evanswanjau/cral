import { Router } from "express";
import type { PaginatedResult } from "@cral/types";
import { db } from "../db/client.js";
import { redisConnection } from "../jobs/queue.js";
import { applyCursor, toPaginatedResult } from "../lib/pagination.js";

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

/**
 * Proves the whole Phase 0 pipeline end to end against real conventions:
 * cursor pagination, the shared envelope shape, the audit_log table. Reads
 * the audit log itself (there's nothing else to read yet) — pass an
 * Idempotency-Key POST later once a phase actually writes to it.
 */
healthRouter.get("/audit-log", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 25), 100);
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

  const rows = await applyCursor(db("audit_log").select("*"), {
    sortColumn: "created_at",
    direction: "desc",
    limit,
    ...(cursor ? { cursor } : {}),
  });

  const result: PaginatedResult<(typeof rows)[number]> = toPaginatedResult(rows, limit, "created_at");
  res.status(200).json(result);
});

import { Router, type Request } from "express";
import { requireAdmin } from "../../middleware/require-admin.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import * as admin from "./service.js";
import type { AdminContextInput } from "./service.js";
import { CutRunSchema, RunListQuerySchema } from "./schemas.js";

export const adminPayoutsRouter = Router();

// Finance only - `admin_super` bypasses the role check (require-admin.ts).
const guard = requireAdmin({ role: ["admin_finance"] });

function ctxOf(req: Request): AdminContextInput {
  return {
    adminId: req.admin!.id,
    adminName: req.admin!.name,
    ip: req.ip ?? null,
    requestId: req.requestId ?? null,
  };
}

adminPayoutsRouter.get(
  "/admin/payout-runs",
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.listRuns(RunListQuerySchema.parse(req.query)));
  }),
);

adminPayoutsRouter.get(
  "/admin/payout-runs/:id",
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.getRun(req.params.id as string));
  }),
);

// Moves money - Idempotency-Key required (spec §2). `guard` runs first so
// keys are scoped per admin.
adminPayoutsRouter.post(
  "/admin/payout-runs/:id/pay",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const result = await admin.payRun(req.params.id as string, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

// Cutting doesn't move money, but a double-submit would cut two runs.
adminPayoutsRouter.post(
  "/admin/payout-runs",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const result = await admin.cutRunNow(CutRunSchema.parse(req.body));
    await req.idempotency!.complete(201, result);
    res.status(201).json(result);
  }),
);

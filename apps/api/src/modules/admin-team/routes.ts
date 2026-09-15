import { Router, type Request } from "express";
import { requireAdmin } from "../../middleware/require-admin.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { AdminCtx } from "./service.js";
import * as adminTeam from "./service.js";
import { CreateAdminSchema, ListAdminsQuerySchema, UpdateAdminSchema } from "./schemas.js";

export const adminTeamRouter = Router();

// Team management is `admin_super` only — every other role is a queue
// worker, not someone who should be able to mint new Ops accounts.
const guard = requireAdmin({ role: "admin_super" });

function ctxOf(req: Request): AdminCtx {
  return { adminId: req.admin!.id, ip: req.ip ?? null, requestId: req.requestId ?? null };
}

adminTeamRouter.get(
  "/admin/team",
  guard,
  asyncHandler(async (req, res) => {
    const q = ListAdminsQuerySchema.parse(req.query);
    const result = await adminTeam.listAdmins(q.cursor, q.limit);
    res.status(200).json(result);
  }),
);

adminTeamRouter.post(
  "/admin/team",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = CreateAdminSchema.parse(req.body);
    const result = await adminTeam.createAdmin(body, ctxOf(req));
    await req.idempotency!.complete(201, result);
    res.status(201).json(result);
  }),
);

adminTeamRouter.patch(
  "/admin/team/:id",
  guard,
  asyncHandler(async (req, res) => {
    const body = UpdateAdminSchema.parse(req.body);
    const result = await adminTeam.updateAdmin(req.params.id as string, body, ctxOf(req));
    res.status(200).json(result);
  }),
);

adminTeamRouter.post(
  "/admin/team/:id/deactivate",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const result = await adminTeam.deactivateAdmin(req.params.id as string, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

adminTeamRouter.post(
  "/admin/team/:id/reactivate",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const result = await adminTeam.reactivateAdmin(req.params.id as string, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

adminTeamRouter.post(
  "/admin/team/:id/reset-invite",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const result = await adminTeam.resetAdminPassword(req.params.id as string, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

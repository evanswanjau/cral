import { Router, type Request } from "express";
import { requireAdmin } from "../../middleware/require-admin.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { AdminCtx } from "./service.js";
import * as adminComms from "./service.js";
import { CreateTemplateSchema, ListRunsQuerySchema, SendCommsSchema } from "./schemas.js";

export const adminCommsRouter = Router();

// Same reach as Team: money spent on SMS, every merchant contactable at
// once. `admin_super` only.
const guard = requireAdmin({ role: "admin_super" });

function ctxOf(req: Request): AdminCtx {
  return { adminId: req.admin!.id, ip: req.ip ?? null, requestId: req.requestId ?? null };
}

adminCommsRouter.get(
  "/admin/comms/audiences",
  guard,
  asyncHandler(async (_req, res) => {
    res.status(200).json(await adminComms.listAudiences());
  }),
);

adminCommsRouter.get(
  "/admin/comms/templates",
  guard,
  asyncHandler(async (_req, res) => {
    res.status(200).json(await adminComms.listTemplates());
  }),
);

adminCommsRouter.post(
  "/admin/comms/templates",
  guard,
  asyncHandler(async (req, res) => {
    const body = CreateTemplateSchema.parse(req.body);
    const result = await adminComms.createTemplate(body, ctxOf(req));
    res.status(201).json(result);
  }),
);

adminCommsRouter.post(
  "/admin/comms/send",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = SendCommsSchema.parse(req.body);
    const result = await adminComms.sendComms(body, ctxOf(req));
    await req.idempotency!.complete(201, result);
    res.status(201).json(result);
  }),
);

adminCommsRouter.get(
  "/admin/comms/runs",
  guard,
  asyncHandler(async (req, res) => {
    const q = ListRunsQuerySchema.parse(req.query);
    res.status(200).json(await adminComms.listRuns(q.cursor, q.limit));
  }),
);

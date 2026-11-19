import { Router, type Request } from "express";
import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";
import { requireAdmin } from "../../middleware/require-admin.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { sendPhoto } from "../outlets/routes.js";
import type { AdminContextInput } from "../admin-vehicles/service.js";
import * as admin from "./service.js";

/** Outlet review - openapi/admin-outlets.yaml. `admin_reviewer` + the `outlets` queue; `admin_super` bypasses both. */
export const adminOutletsRouter = Router();
const guard = requireAdmin({ role: "admin_reviewer", queue: "outlets" });

const QueueQuerySchema = PaginationQuerySchema.extend({
  filter: z.enum(admin.OUTLET_QUEUE_FILTERS as [string, ...string[]]).default("open"),
});
const ChecklistSchema = z.object({
  item_id: z.string().min(1).max(40),
  result: z.enum(["pending", "pass", "flag"]),
  note: z.string().max(2000).nullable().optional(),
  visited_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").optional(),
  visited_by: z.string().max(120).optional(),
});
const DecisionSchema = z.object({
  action: z.enum(["approve", "request_changes", "reject"]),
  note: z.string().max(2000).optional(),
});

function ctxOf(req: Request): AdminContextInput {
  return { adminId: req.admin!.id, adminName: req.admin!.name, ip: req.ip ?? null, requestId: req.requestId ?? null };
}
const id = (req: Request) => req.params.outletId as string;

adminOutletsRouter.get(
  "/admin/outlets",
  guard,
  asyncHandler(async (req, res) => {
    const q = QueueQuerySchema.parse(req.query);
    res.status(200).json(await admin.listOutletQueue({ filter: q.filter, cursor: q.cursor, limit: q.limit }));
  }),
);

adminOutletsRouter.get(
  "/admin/outlets/:outletId",
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.getOutletCase(id(req)));
  }),
);

adminOutletsRouter.get(
  "/admin/outlets/:outletId/photos/:photoId",
  guard,
  asyncHandler(async (req, res) => {
    sendPhoto(res, await admin.readCasePhoto(id(req), req.params.photoId as string));
  }),
);

adminOutletsRouter.post(
  "/admin/outlets/:outletId/assign",
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.assignOutlet(id(req), ctxOf(req)));
  }),
);

adminOutletsRouter.post(
  "/admin/outlets/:outletId/checklist",
  guard,
  asyncHandler(async (req, res) => {
    const body = ChecklistSchema.parse(req.body);
    res.status(200).json(await admin.setOutletCheck(id(req), body, ctxOf(req)));
  }),
);

adminOutletsRouter.post(
  "/admin/outlets/:outletId/decision",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = DecisionSchema.parse(req.body);
    const result = await admin.decideOutlet(id(req), body.action, body.note ?? null, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

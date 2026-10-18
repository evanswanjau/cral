import { Router, type Request } from "express";
import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";
import { requireAdmin } from "../../middleware/require-admin.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { safeContentType, safeDisposition } from "../../lib/uploads.js";
import type { AdminContextInput } from "../admin-vehicles/service.js";
import * as admin from "./service.js";

/** Driver review - openapi/admin-drivers.yaml. `admin_reviewer` + the `drivers` queue; `admin_super` bypasses both. */
export const adminDriversRouter = Router();
const guard = requireAdmin({ role: "admin_reviewer", queue: "drivers" });

const QueueQuerySchema = PaginationQuerySchema.extend({
  filter: z.enum(admin.DRIVER_QUEUE_FILTERS as [string, ...string[]]).default("open"),
});
const DocumentDecisionSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  note: z.string().max(2000).optional(),
});
const DriverDecisionSchema = z.object({
  action: z.enum(["approve", "request_changes", "reject"]),
  note: z.string().max(2000).optional(),
});

function ctxOf(req: Request): AdminContextInput {
  return { adminId: req.admin!.id, adminName: req.admin!.name, ip: req.ip ?? null, requestId: req.requestId ?? null };
}

adminDriversRouter.get(
  "/admin/drivers",
  guard,
  asyncHandler(async (req, res) => {
    const q = QueueQuerySchema.parse(req.query);
    res.status(200).json(await admin.listDriverQueue({ filter: q.filter, cursor: q.cursor, limit: q.limit }));
  }),
);

adminDriversRouter.get(
  "/admin/drivers/:driverId",
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.getDriverCase(req.params.driverId as string));
  }),
);

adminDriversRouter.get(
  "/admin/drivers/:driverId/documents/:documentId",
  guard,
  asyncHandler(async (req, res) => {
    const doc = await admin.readDriverDocument(req.params.driverId as string, req.params.documentId as string);
    res.setHeader("Content-Type", safeContentType(doc.contentType));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Disposition", `${safeDisposition(doc.contentType)}; filename="${encodeURIComponent(doc.originalName)}"`);
    res.status(200).send(doc.body);
  }),
);

adminDriversRouter.post(
  "/admin/drivers/:driverId/documents/:kind/decision",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = DocumentDecisionSchema.parse(req.body);
    const result = await admin.decideDriverDocument(
      req.params.driverId as string,
      req.params.kind as string,
      body.decision,
      body.note ?? null,
      ctxOf(req),
    );
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

adminDriversRouter.post(
  "/admin/drivers/:driverId/decision",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = DriverDecisionSchema.parse(req.body);
    const result = await admin.decideDriver(req.params.driverId as string, body.action, body.note ?? null, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

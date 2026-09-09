import { Router, type Request } from "express";
import { requireAdmin } from "../../middleware/require-admin.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { safeContentType, safeDisposition } from "../../lib/uploads.js";
import type { AdminContextInput } from "./service.js";
import * as admin from "./service.js";
import {
  ChecklistItemSchema,
  DocumentDecisionSchema,
  ListingDecisionSchema,
  QueueQuerySchema,
} from "./schemas.js";

export const adminVehiclesRouter = Router();

// Vehicle review is the `admin_reviewer` role and the `vehicles` queue.
// `admin_super` bypasses both checks (see require-admin.ts).
const guard = requireAdmin({ role: "admin_reviewer", queue: "vehicles" });

function ctxOf(req: Request): AdminContextInput {
  return {
    adminId: req.admin!.id,
    adminName: req.admin!.name,
    ip: req.ip ?? null,
    requestId: req.requestId ?? null,
  };
}

adminVehiclesRouter.get(
  "/admin/vehicles",
  guard,
  asyncHandler(async (req, res) => {
    const query = QueueQuerySchema.parse(req.query);
    const result = await admin.listReviewQueue(ctxOf(req), {
      limit: query.limit,
      ...(query.bucket ? { bucket: query.bucket } : {}),
      ...(query.mine ? { mineOnly: true } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    res.status(200).json(result);
  }),
);

adminVehiclesRouter.get(
  "/admin/vehicles/:vehicleId",
  guard,
  asyncHandler(async (req, res) => {
    const result = await admin.getReviewCase(req.params.vehicleId as string);
    res.status(200).json(result);
  }),
);

adminVehiclesRouter.get(
  "/admin/vehicles/:vehicleId/documents/:documentId",
  guard,
  asyncHandler(async (req, res) => {
    const doc = await admin.readCaseDocument(req.params.documentId as string);
    res.setHeader("Content-Type", safeContentType(doc.contentType));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader(
      "Content-Disposition",
      `${safeDisposition(doc.contentType)}; filename="${encodeURIComponent(doc.originalName)}"`,
    );
    res.status(200).send(doc.body);
  }),
);

adminVehiclesRouter.post(
  "/admin/vehicles/:vehicleId/assign",
  guard,
  asyncHandler(async (req, res) => {
    const result = await admin.assignCase(req.params.vehicleId as string, ctxOf(req));
    res.status(200).json(result);
  }),
);

// One checklist answer. Idempotent by nature (an upsert), so no key.
adminVehiclesRouter.post(
  "/admin/vehicles/:vehicleId/checklist",
  guard,
  asyncHandler(async (req, res) => {
    const body = ChecklistItemSchema.parse(req.body);
    const result = await admin.setChecklistItem(
      req.params.vehicleId as string,
      body.item_id,
      body.result,
      body.note ?? null,
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

// A document decision doesn't move money, but a double-click must not
// double-apply (and a reject double-fires the merchant notification).
adminVehiclesRouter.post(
  "/admin/vehicles/:vehicleId/documents/:kind/decision",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = DocumentDecisionSchema.parse(req.body);
    const result = await admin.decideDocument(
      req.params.vehicleId as string,
      req.params.kind as string,
      body.decision,
      body.note ?? null,
      ctxOf(req),
    );
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

adminVehiclesRouter.post(
  "/admin/vehicles/:vehicleId/decision",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = ListingDecisionSchema.parse(req.body);
    const result = await admin.decideListing(
      req.params.vehicleId as string,
      body.action,
      body.note ?? null,
      ctxOf(req),
    );
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

import { Router, type Request } from "express";
import { z } from "zod";
import { requireAdmin } from "../../middleware/require-admin.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { safeContentType, safeDisposition } from "../../lib/uploads.js";
import type { AdminCtx } from "./service.js";
import * as admin from "./service.js";

export const adminRentersRouter = Router();

const guard = requireAdmin({ role: "admin_reviewer", queue: "renters" });

function ctxOf(req: Request): AdminCtx {
  return {
    adminId: req.admin!.id,
    adminName: req.admin!.name,
    ip: req.ip ?? null,
    requestId: req.requestId ?? null,
  };
}

const ListQuerySchema = z.object({
  filter: z.enum(["all", "pending", "verified", "rejected"]).default("all"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const DecisionSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  note: z.string().trim().min(1).max(2000).optional(),
});

adminRentersRouter.get(
  "/admin/renters",
  guard,
  asyncHandler(async (req, res) => {
    const q = ListQuerySchema.parse(req.query);
    const result = await admin.listRenters({
      filter: q.filter,
      limit: q.limit,
      ...(q.cursor ? { cursor: q.cursor } : {}),
    });
    res.status(200).json(result);
  }),
);

adminRentersRouter.get(
  "/admin/renters/:userId",
  guard,
  asyncHandler(async (req, res) => {
    const result = await admin.getRenterFile(req.params.userId as string);
    res.status(200).json(result);
  }),
);

adminRentersRouter.get(
  "/admin/renters/:userId/documents/:documentId",
  guard,
  asyncHandler(async (req, res) => {
    const doc = await admin.readRenterDocument(
      req.params.userId as string,
      req.params.documentId as string,
    );
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

adminRentersRouter.post(
  "/admin/renters/:userId/documents/:kind/decision",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = DecisionSchema.parse(req.body);
    const result = await admin.decideRenterDocument(
      req.params.userId as string,
      req.params.kind as string,
      body.decision,
      body.note ?? null,
      ctxOf(req),
    );
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

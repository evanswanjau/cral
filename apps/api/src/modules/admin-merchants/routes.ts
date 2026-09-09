import { Router, type Request } from "express";
import { z } from "zod";
import { requireAdmin } from "../../middleware/require-admin.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { safeContentType, safeDisposition } from "../../lib/uploads.js";
import type { AdminCtx } from "./service.js";
import * as admin from "./service.js";

export const adminMerchantsRouter = Router();

// The Merchants lens is the `admin_reviewer` role and the `merchants`
// queue; `admin_super` bypasses both (see require-admin.ts).
const guard = requireAdmin({ role: "admin_reviewer", queue: "merchants" });

function ctxOf(req: Request): AdminCtx {
  return {
    adminId: req.admin!.id,
    adminName: req.admin!.name,
    ip: req.ip ?? null,
    requestId: req.requestId ?? null,
  };
}

const ListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const DocDecisionSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  note: z.string().trim().min(1).max(2000).optional(),
});
const ChecklistItemSchema = z.object({
  item_id: z.string().min(1).max(40),
  result: z.enum(["pending", "pass", "flag"]),
  note: z.string().trim().max(2000).optional(),
});

adminMerchantsRouter.get(
  "/admin/merchants",
  guard,
  asyncHandler(async (req, res) => {
    const q = ListQuerySchema.parse(req.query);
    const result = await admin.listMerchants({ limit: q.limit, ...(q.cursor ? { cursor: q.cursor } : {}) });
    res.status(200).json(result);
  }),
);

adminMerchantsRouter.get(
  "/admin/merchants/:merchantId",
  guard,
  asyncHandler(async (req, res) => {
    const result = await admin.getMerchantFile(req.params.merchantId as string);
    res.status(200).json(result);
  }),
);

adminMerchantsRouter.get(
  "/admin/merchants/:merchantId/documents/:documentId",
  guard,
  asyncHandler(async (req, res) => {
    const doc = await admin.readBusinessDocument(
      req.params.merchantId as string,
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

adminMerchantsRouter.post(
  "/admin/merchants/:merchantId/checklist",
  guard,
  asyncHandler(async (req, res) => {
    const body = ChecklistItemSchema.parse(req.body);
    const result = await admin.setMerchantChecklistItem(
      req.params.merchantId as string,
      body.item_id,
      body.result,
      body.note ?? null,
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

adminMerchantsRouter.post(
  "/admin/merchants/:merchantId/documents/:kind/decision",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = DocDecisionSchema.parse(req.body);
    const result = await admin.decideMerchantDocument(
      req.params.merchantId as string,
      req.params.kind as string,
      body.decision,
      body.note ?? null,
      ctxOf(req),
    );
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

adminMerchantsRouter.post(
  "/admin/merchants/:merchantId/approve",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const result = await admin.approveMerchant(req.params.merchantId as string, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

adminMerchantsRouter.post(
  "/admin/merchants/:merchantId/reopen",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const result = await admin.reopenMerchantReview(req.params.merchantId as string, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

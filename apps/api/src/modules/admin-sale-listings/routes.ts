import { Router, type Request } from "express";
import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";
import { requireAdmin } from "../../middleware/require-admin.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { safeContentType, safeDisposition } from "../../lib/uploads.js";
import type { AdminContextInput } from "../admin-vehicles/service.js";
import * as admin from "./service.js";

/** Car-sale review - openapi/admin-sales.yaml. `admin_reviewer` + the `sales` queue; `admin_super` bypasses both. */
export const adminSaleListingsRouter = Router();
const guard = requireAdmin({ role: "admin_reviewer", queue: "sales" });

const QueueQuerySchema = PaginationQuerySchema.extend({
  filter: z.enum(admin.SALE_QUEUE_FILTERS as [string, ...string[]]).default("open"),
});
const CheckSchema = z.object({
  item_id: z.string(),
  result: z.enum(["pass", "flag", "pending"]),
  note: z.string().max(2000).optional(),
});
const DocumentDecisionSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  note: z.string().max(2000).optional(),
});
const DecisionSchema = z.object({
  action: z.enum(["approve", "request_changes", "reject"]),
  note: z.string().max(2000).optional(),
});
const RemoveSchema = z.object({ note: z.string().max(2000) });
const ResolveSchema = z.object({ outcome: z.enum(["dismissed", "actioned"]) });

function ctxOf(req: Request): AdminContextInput {
  return { adminId: req.admin!.id, adminName: req.admin!.name, ip: req.ip ?? null, requestId: req.requestId ?? null };
}

adminSaleListingsRouter.get(
  "/admin/sale-listings",
  guard,
  asyncHandler(async (req, res) => {
    const q = QueueQuerySchema.parse(req.query);
    res.status(200).json(await admin.listSaleQueue({ filter: q.filter, cursor: q.cursor, limit: q.limit }));
  }),
);

adminSaleListingsRouter.get(
  "/admin/sale-listings/:listingId",
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.getSaleCase(req.params.listingId as string));
  }),
);

adminSaleListingsRouter.post(
  "/admin/sale-listings/:listingId/assign",
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.assignSaleCase(req.params.listingId as string, ctxOf(req)));
  }),
);

adminSaleListingsRouter.post(
  "/admin/sale-listings/:listingId/checklist",
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.setSaleCheck(req.params.listingId as string, CheckSchema.parse(req.body), ctxOf(req)));
  }),
);

adminSaleListingsRouter.get(
  "/admin/sale-listings/:listingId/documents/:documentId",
  guard,
  asyncHandler(async (req, res) => {
    const doc = await admin.readSaleCaseDocument(req.params.listingId as string, req.params.documentId as string);
    res.setHeader("Content-Type", safeContentType(doc.contentType));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Disposition", `${safeDisposition(doc.contentType)}; filename="${encodeURIComponent(doc.originalName)}"`);
    res.status(200).send(doc.body);
  }),
);

adminSaleListingsRouter.post(
  "/admin/sale-listings/:listingId/documents/:documentId/decision",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = DocumentDecisionSchema.parse(req.body);
    const result = await admin.decideSaleDocument(
      req.params.listingId as string,
      req.params.documentId as string,
      body.decision,
      body.note ?? null,
      ctxOf(req),
    );
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

adminSaleListingsRouter.post(
  "/admin/sale-listings/:listingId/decision",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = DecisionSchema.parse(req.body);
    const result = await admin.decideSaleListing(req.params.listingId as string, body.action, body.note ?? null, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

adminSaleListingsRouter.post(
  "/admin/sale-listings/:listingId/remove",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = RemoveSchema.parse(req.body);
    const result = await admin.removeSaleListing(req.params.listingId as string, body.note, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

adminSaleListingsRouter.post(
  "/admin/sale-listings/:listingId/reinstate",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const result = await admin.reinstateSaleListing(req.params.listingId as string, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

adminSaleListingsRouter.post(
  "/admin/sale-reports/:reportId/resolve",
  guard,
  asyncHandler(async (req, res) => {
    const body = ResolveSchema.parse(req.body);
    res.status(200).json(await admin.resolveSaleReport(req.params.reportId as string, body.outcome, ctxOf(req)));
  }),
);

import { Router, type Request } from "express";
import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";
import { requireAdmin } from "../../middleware/require-admin.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { sendPhoto } from "../outlets/routes.js";
import type { AdminContextInput } from "../admin-vehicles/service.js";
import * as admin from "./service.js";

/** Sale-listing review and reports - openapi/admin-sales.yaml. `admin_reviewer` + the `sales` queue; `admin_super` bypasses both. */
export const adminSaleListingsRouter = Router();
const guard = requireAdmin({ role: "admin_reviewer", queue: "sales" });

const QueueQuerySchema = PaginationQuerySchema.extend({
  filter: z.enum(admin.SALE_QUEUE_FILTERS as [string, ...string[]]).default("open"),
});
const ReportQuerySchema = PaginationQuerySchema.extend({
  filter: z.enum(admin.REPORT_FILTERS).default("open"),
});
const ChecklistSchema = z.object({
  item_id: z.string().min(1).max(40),
  result: z.enum(["pending", "pass", "flag"]),
  note: z.string().max(2000).nullable().optional(),
});
const DecisionSchema = z.object({
  action: z.enum(["approve", "request_changes", "reject"]),
  note: z.string().max(2000).optional(),
});
const ResolveSchema = z.object({
  action: z.enum(["dismiss", "pause", "take_down"]),
  note: z.string().max(2000).optional(),
});

function ctxOf(req: Request): AdminContextInput {
  return { adminId: req.admin!.id, adminName: req.admin!.name, ip: req.ip ?? null, requestId: req.requestId ?? null };
}
const id = (req: Request) => req.params.listingId as string;
const BASE = "/admin/sale-listings";

adminSaleListingsRouter.get(
  BASE,
  guard,
  asyncHandler(async (req, res) => {
    const q = QueueQuerySchema.parse(req.query);
    res.status(200).json(await admin.listSaleQueue({ filter: q.filter, cursor: q.cursor, limit: q.limit }));
  }),
);

adminSaleListingsRouter.get(
  `${BASE}/:listingId`,
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.getSaleCase(id(req)));
  }),
);

adminSaleListingsRouter.get(
  `${BASE}/:listingId/files/:fileId`,
  guard,
  asyncHandler(async (req, res) => {
    sendPhoto(res, await admin.readCaseFile(id(req), req.params.fileId as string));
  }),
);

adminSaleListingsRouter.post(
  `${BASE}/:listingId/assign`,
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.assignSale(id(req), ctxOf(req)));
  }),
);

adminSaleListingsRouter.post(
  `${BASE}/:listingId/checklist`,
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.setSaleCheck(id(req), ChecklistSchema.parse(req.body), ctxOf(req)));
  }),
);

adminSaleListingsRouter.post(
  `${BASE}/:listingId/decision`,
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = DecisionSchema.parse(req.body);
    const result = await admin.decideSale(id(req), body.action, body.note ?? null, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

adminSaleListingsRouter.get(
  "/admin/sale-reports",
  guard,
  asyncHandler(async (req, res) => {
    const q = ReportQuerySchema.parse(req.query);
    res.status(200).json(await admin.listSaleReports({ filter: q.filter, cursor: q.cursor, limit: q.limit }));
  }),
);

adminSaleListingsRouter.post(
  "/admin/sale-reports/:reportId/resolve",
  guard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = ResolveSchema.parse(req.body);
    const result = await admin.resolveSaleReport(req.params.reportId as string, body.action, body.note ?? null, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

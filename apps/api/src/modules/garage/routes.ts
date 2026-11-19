import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { RequestContext } from "../merchant/service.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { requireAdmin } from "../../middleware/require-admin.js";
import * as garage from "./service.js";
import * as orders from "./orders.js";
import * as serviceRecord from "./service-record.js";
import {
  AdminOrderQuerySchema,
  ExtraQuoteSchema,
  MerchantOrderQuerySchema,
  PayOrderSchema,
  ProblemSchema,
  ResolveSchema,
  CarSchema,
  CreatePartsRequestSchema,
  CreateRequestSchema,
  KindListQuerySchema,
  ListQuerySchema,
  MerchantListQuerySchema,
  PreviewSchema,
  QuoteSchema,
} from "./schemas.js";

/**
 * Garage quotes (Phase 4 GS2) and orders (GS3): openapi/customer-garage.yaml,
 * openapi/merchant-garage.yaml, openapi/admin-garage-orders.yaml. The quote
 * routes move no money and take no `Idempotency-Key`; every order POST that
 * moves money or settles one (accept, pay, cancel, accept extra, confirm,
 * Ops resolve) requires one, mounted after `authenticate()`/`requireAdmin`.
 */
export const garageRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}
const rid = (req: Request) => req.params.requestId as string;

// --- customer: My cars -------------------------------------------------

garageRouter.get(
  "/me/cars",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await garage.listCars(req.auth!.sub, ListQuerySchema.parse(req.query)));
  }),
);

garageRouter.post(
  "/me/cars",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(201).json(await garage.createCar(req.auth!.sub, CarSchema.parse(req.body), ctxOf(req)));
  }),
);

garageRouter.patch(
  "/me/cars/:carId",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await garage.updateCar(req.auth!.sub, req.params.carId as string, CarSchema.parse(req.body), ctxOf(req)));
  }),
);

garageRouter.delete(
  "/me/cars/:carId",
  authenticate(),
  asyncHandler(async (req, res) => {
    await garage.deleteCar(req.auth!.sub, req.params.carId as string, ctxOf(req));
    res.status(204).send();
  }),
);

garageRouter.get(
  "/me/cars/:carId/service-record",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await serviceRecord.customerServiceRecord(req.auth!.sub, req.params.carId as string, ListQuerySchema.parse(req.query)));
  }),
);

// --- customer: requests ------------------------------------------------

garageRouter.post(
  "/me/garage-requests",
  authenticate(),
  rateLimit({ bucket: "garage_request", limit: 5, windowSeconds: 3600, keyFn: (req) => req.auth?.sub ?? req.ip ?? "unknown" }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await garage.createRequest(req.auth!.sub, CreateRequestSchema.parse(req.body), ctxOf(req)));
  }),
);

// Spare parts (Phase 5 PT1, docs/decisions/parts.md): only creating a
// parts request differs. Reading, cancelling, accepting and paying use the
// garage routes, which serve both kinds by id.
garageRouter.post(
  "/me/parts-requests",
  authenticate(),
  rateLimit({ bucket: "garage_request", limit: 5, windowSeconds: 3600, keyFn: (req) => req.auth?.sub ?? req.ip ?? "unknown" }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await garage.createPartsRequest(req.auth!.sub, CreatePartsRequestSchema.parse(req.body), ctxOf(req)));
  }),
);

garageRouter.get(
  "/me/garage-requests",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await garage.listMyRequests(req.auth!.sub, KindListQuerySchema.parse(req.query)));
  }),
);

garageRouter.get(
  "/me/garage-requests/:requestId",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await garage.getMyRequest(req.auth!.sub, rid(req)));
  }),
);

garageRouter.post(
  "/me/garage-requests/:requestId/cancel",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await garage.cancelMyRequest(req.auth!.sub, rid(req), ctxOf(req)));
  }),
);

// --- merchant ----------------------------------------------------------

garageRouter.post(
  "/merchant/garage-requests/quote-preview",
  authenticate(),
  asyncHandler(async (req, res) => {
    const body = PreviewSchema.parse(req.body);
    res.status(200).json(await garage.previewQuote(body.lines, body.kind));
  }),
);

garageRouter.get(
  "/merchant/garage-requests",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await garage.listMerchantRequests(req.auth!.sub, MerchantListQuerySchema.parse(req.query)));
  }),
);

garageRouter.get(
  "/merchant/garage-requests/:requestId",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await garage.getMerchantRequest(req.auth!.sub, rid(req)));
  }),
);

garageRouter.post(
  "/merchant/garage-requests/:requestId/quote",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await garage.sendQuote(req.auth!.sub, rid(req), QuoteSchema.parse(req.body), ctxOf(req)));
  }),
);

garageRouter.post(
  "/merchant/garage-requests/:requestId/quote/withdraw",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await garage.withdrawQuote(req.auth!.sub, rid(req), ctxOf(req)));
  }),
);

garageRouter.post(
  "/merchant/garage-requests/:requestId/decline",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await garage.declineRequest(req.auth!.sub, rid(req), ctxOf(req)));
  }),
);

// --- GS3: customer orders ---------------------------------------------

const oid = (req: Request) => req.params.orderId as string;
const qid = (req: Request) => req.params.quoteId as string;

garageRouter.post(
  "/me/garage-requests/:requestId/quotes/:quoteId/accept",
  authenticate(),
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    res.status(201).json(await orders.acceptQuote(req.auth!.sub, rid(req), qid(req), ctxOf(req)));
  }),
);

garageRouter.get(
  "/me/garage-orders",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.listMyOrders(req.auth!.sub, KindListQuerySchema.parse(req.query)));
  }),
);

garageRouter.get(
  "/me/garage-orders/:orderId",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.getMyOrder(req.auth!.sub, oid(req)));
  }),
);

garageRouter.post(
  "/me/garage-orders/:orderId/pay",
  authenticate(),
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    res.status(202).json(await orders.payOrder(req.auth!.sub, oid(req), PayOrderSchema.parse(req.body), ctxOf(req)));
  }),
);

garageRouter.post(
  "/me/garage-orders/:orderId/cancel",
  authenticate(),
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.cancelMyOrder(req.auth!.sub, oid(req), ctxOf(req)));
  }),
);

garageRouter.post(
  "/me/garage-orders/:orderId/extras/:quoteId/accept",
  authenticate(),
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.acceptExtra(req.auth!.sub, oid(req), qid(req), ctxOf(req)));
  }),
);

garageRouter.post(
  "/me/garage-orders/:orderId/extras/:quoteId/decline",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.declineExtra(req.auth!.sub, oid(req), qid(req), ctxOf(req)));
  }),
);

garageRouter.post(
  "/me/garage-orders/:orderId/confirm",
  authenticate(),
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.confirmOrder(req.auth!.sub, oid(req), ctxOf(req)));
  }),
);

garageRouter.post(
  "/me/garage-orders/:orderId/problem",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.raiseProblem(req.auth!.sub, oid(req), ProblemSchema.parse(req.body), ctxOf(req)));
  }),
);

// --- GS3: merchant orders ---------------------------------------------

garageRouter.get(
  "/merchant/garage-orders",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.listMerchantOrders(req.auth!.sub, MerchantOrderQuerySchema.parse(req.query)));
  }),
);

garageRouter.get(
  "/merchant/garage-orders/:orderId",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.getMerchantOrder(req.auth!.sub, oid(req)));
  }),
);

garageRouter.get(
  "/merchant/garage-orders/:orderId/service-record",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await serviceRecord.merchantServiceRecord(req.auth!.sub, oid(req), ListQuerySchema.parse(req.query)));
  }),
);

garageRouter.post(
  "/merchant/garage-orders/:orderId/start",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.startOrder(req.auth!.sub, oid(req), ctxOf(req)));
  }),
);

garageRouter.post(
  "/merchant/garage-orders/:orderId/ready",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.markReady(req.auth!.sub, oid(req), ctxOf(req)));
  }),
);

garageRouter.post(
  "/merchant/garage-orders/:orderId/extras",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(201).json(await orders.sendExtra(req.auth!.sub, oid(req), ExtraQuoteSchema.parse(req.body), ctxOf(req)));
  }),
);

garageRouter.post(
  "/merchant/garage-orders/:orderId/extras/:quoteId/withdraw",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.withdrawExtra(req.auth!.sub, oid(req), qid(req), ctxOf(req)));
  }),
);

// --- GS3: Ops ----------------------------------------------------------

const opsGuard = requireAdmin({ role: ["admin_support", "admin_finance"] });

garageRouter.get(
  "/admin/garage-orders",
  opsGuard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.listAdminOrders(AdminOrderQuerySchema.parse(req.query)));
  }),
);

garageRouter.get(
  "/admin/garage-orders/:orderId",
  opsGuard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.getAdminOrder(oid(req)));
  }),
);

garageRouter.post(
  "/admin/garage-orders/:orderId/resolve",
  opsGuard,
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await orders.resolveProblem(req.admin!.id, oid(req), ResolveSchema.parse(req.body), ctxOf(req)));
  }),
);

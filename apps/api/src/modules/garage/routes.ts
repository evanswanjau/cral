import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { RequestContext } from "../merchant/service.js";
import * as garage from "./service.js";
import {
  CarSchema,
  CreateRequestSchema,
  ListQuerySchema,
  MerchantListQuerySchema,
  PreviewSchema,
  QuoteSchema,
} from "./schemas.js";

/**
 * Garage quotes (Phase 4 GS2): openapi/customer-garage.yaml and
 * openapi/merchant-garage.yaml. No `Idempotency-Key`: nothing here moves
 * money (accepting and paying a quote is GS3).
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

// --- customer: requests ------------------------------------------------

garageRouter.post(
  "/me/garage-requests",
  authenticate(),
  rateLimit({ bucket: "garage_request", limit: 5, windowSeconds: 3600, keyFn: (req) => req.auth?.sub ?? req.ip ?? "unknown" }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await garage.createRequest(req.auth!.sub, CreateRequestSchema.parse(req.body), ctxOf(req)));
  }),
);

garageRouter.get(
  "/me/garage-requests",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await garage.listMyRequests(req.auth!.sub, ListQuerySchema.parse(req.query)));
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
    res.status(200).json(await garage.previewQuote(PreviewSchema.parse(req.body).lines));
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

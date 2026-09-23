import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { asyncHandler } from "../../lib/async-handler.js";
import * as service from "./service.js";
import type { RequestContext } from "./service.js";
import {
  CancelServiceRequestSchema,
  CreateServiceRequestSchema,
  ListMyServiceRequestsQuerySchema,
} from "./schemas.js";

export const serviceRequestsRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

/**
 * Towing/recovery, the first offering under "Services" (owner's call,
 * 2026-09-23). No `Idempotency-Key` — this doesn't move money or complete
 * a handover, it just files a lead for a human to quote. Rate-limited per
 * renter because every request emails the dispatch inbox.
 */
serviceRequestsRouter.post(
  "/services/towing",
  authenticate(),
  rateLimit({ bucket: "service_request", limit: 5, windowSeconds: 3600, keyFn: (req) => req.auth?.sub ?? req.ip ?? "unknown" }),
  asyncHandler(async (req, res) => {
    const body = CreateServiceRequestSchema.parse(req.body);
    const result = await service.createServiceRequest(req.auth!.sub, body, ctxOf(req));
    res.status(201).json(result);
  }),
);

serviceRequestsRouter.get(
  "/me/service-requests",
  authenticate(),
  asyncHandler(async (req, res) => {
    const query = ListMyServiceRequestsQuerySchema.parse(req.query);
    res.status(200).json(await service.listMyServiceRequests(req.auth!.sub, query));
  }),
);

serviceRequestsRouter.get(
  "/me/service-requests/:id",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await service.getMyServiceRequest(req.auth!.sub, req.params.id as string));
  }),
);

serviceRequestsRouter.post(
  "/me/service-requests/:id/cancel",
  authenticate(),
  asyncHandler(async (req, res) => {
    const body = CancelServiceRequestSchema.parse(req.body);
    const result = await service.cancelMyServiceRequest(req.auth!.sub, req.params.id as string, body, ctxOf(req));
    res.status(200).json(result);
  }),
);

serviceRequestsRouter.post(
  "/me/service-requests/:id/accept",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await service.acceptMyServiceRequestQuote(req.auth!.sub, req.params.id as string, ctxOf(req));
    res.status(200).json(result);
  }),
);

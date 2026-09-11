import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import * as service from "./service.js";
import type { RequestContext } from "./service.js";
import {
  CancelBookingSchema,
  CreateBookingSchema,
  ListMyBookingsQuerySchema,
} from "./schemas.js";

export const customerBookingsRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

/**
 * Committing a booking onto an owner's queue. `Idempotency-Key` required -
 * a double-submit must not put the same request in front of the owner
 * twice. `authenticate()` runs before `requireIdempotencyKey()` so keys
 * are scoped per user (the 2026-09-03 security patch).
 */
customerBookingsRouter.post(
  "/bookings",
  authenticate(),
  requireIdempotencyKey(),
  validateBody(CreateBookingSchema),
  asyncHandler(async (req, res) => {
    const result = await service.createBooking(req.auth!.sub, req.body, ctxOf(req));
    await req.idempotency!.complete(201, result);
    res.status(201).json(result);
  }),
);

customerBookingsRouter.get(
  "/bookings",
  authenticate(),
  asyncHandler(async (req, res) => {
    const query = ListMyBookingsQuerySchema.parse(req.query);
    res.status(200).json(await service.listMyBookings(req.auth!.sub, query));
  }),
);

customerBookingsRouter.get(
  "/bookings/:id",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await service.getMyBooking(req.auth!.sub, req.params.id as string));
  }),
);

/** Can move money once a rail is live, so it carries a key too. */
customerBookingsRouter.post(
  "/bookings/:id/cancel",
  authenticate(),
  requireIdempotencyKey(),
  validateBody(CancelBookingSchema),
  asyncHandler(async (req, res) => {
    const result = await service.cancelMyBooking(
      req.auth!.sub,
      req.params.id as string,
      req.body,
      ctxOf(req),
    );
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

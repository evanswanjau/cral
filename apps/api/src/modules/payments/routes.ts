import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import * as service from "./service.js";
import type { RequestContext } from "./service.js";
import { InitiateStkPushSchema } from "./schemas.js";

export const paymentsRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

/** Moves money (an STK prompt) — Idempotency-Key required per spec §2. */
paymentsRouter.post(
  "/bookings/:id/pay",
  authenticate(),
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const input = InitiateStkPushSchema.parse(req.body);
    const result = await service.initiatePayment(
      req.auth!.sub,
      req.params.id as string,
      input,
      ctxOf(req),
    );
    res.status(202).json(result);
  }),
);

/**
 * Co-op Bank's async result callback. The request/response shape it sends
 * is confirmed against their OpenAPI document (see service.ts#handleCallback
 * and coopbank-adapter.ts's top comment) — what is NOT confirmed is how
 * this callback authenticates itself. Server-to-server, so no bearer
 * token; nothing documented about a signature, a shared secret, or a
 * published IP range either. This endpoint still trusts nothing but its
 * own obscurity, which is not a real control — do not point real money at
 * this without a separate answer from Co-op on that.
 */
paymentsRouter.post(
  "/payments/coopbank/callback",
  asyncHandler(async (req, res) => {
    await service.handleCallback(req.body, ctxOf(req));
    // The ack Co-op expects back on this URL isn't documented either -
    // this is a reasonable guess in their own vocabulary (MessageCode/
    // MessageDescription, as the STKPush resource itself uses), not a
    // confirmed contract. A non-2xx would presumably make them retry.
    res.status(200).json({ MessageCode: "0", MessageDescription: "Accepted" });
  }),
);

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
 * Co-op Bank's async result callback. Server-to-server, so no bearer
 * token — CONFIRM whether their gateway signs or otherwise authenticates
 * callbacks (a shared secret in the URL, an IP allowlist) once that's
 * known, and add the check here. Until then this endpoint trusts its own
 * obscurity, which is not a real control - do not point real money at
 * this without that follow-up.
 */
paymentsRouter.post(
  "/payments/coopbank/callback",
  asyncHandler(async (req, res) => {
    await service.handleCallback(req.body, ctxOf(req));
    // Daraja-family callbacks expect a 200 with this shape regardless of
    // outcome — a non-2xx or a different body makes the provider retry.
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }),
);

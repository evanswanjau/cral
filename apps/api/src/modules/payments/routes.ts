import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import * as service from "./service.js";
import type { RequestContext } from "./service.js";
import { InitiateStkPushSchema } from "./schemas.js";
import { parseCoopBankStkCallback } from "../../adapters/payment/coopbank-adapter.js";

export const paymentsRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

/** True when `req` carries exactly `user:password` as HTTP Basic. */
function basicAuthMatches(req: Request, user: string, password: string): boolean {
  const header = req.get("authorization") ?? "";
  const supplied = header.startsWith("Basic ")
    ? Buffer.from(header.slice(6), "base64").toString("utf8")
    : "";
  // `timingSafeEqual` rather than `===` so the comparison can't be walked
  // a character at a time; length is compared first because it throws on
  // mismatched buffers.
  const a = Buffer.from(supplied);
  const b = Buffer.from(`${user}:${password}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * HTTP Basic on a provider callback, checked only when its two env vars
 * are set. A failure returns 401 with no detail - a caller that got this
 * wrong is not one we owe an explanation.
 *
 * `closedWhenUnset` is for a callback that must never be open in
 * production: with no credentials configured it answers 503 there rather
 * than accepting anyone. The Daraja callback doesn't need it - the API
 * refuses to boot in production without its pair (server.ts) - but the
 * Co-op one is mounted whatever `PAYMENT_ADAPTER` is, so no boot guard
 * covers it.
 */
function callbackBasicAuth(userEnv: string, passwordEnv: string, closedWhenUnset = false) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = process.env[userEnv];
    const password = process.env[passwordEnv];
    if (!user || !password) {
      if (closedWhenUnset && process.env.NODE_ENV === "production") {
        res.status(503).json({
          error: {
            type: "server_error",
            code: "callback_not_configured",
            message: "Callback not configured.",
            request_id: req.requestId ?? null,
          },
        });
        return;
      }
      next();
      return;
    }
    if (basicAuthMatches(req, user, password)) {
      next();
      return;
    }
    res.status(401).json({
      error: {
        type: "authentication_error",
        code: "callback_unauthenticated",
        message: "Unauthenticated.",
        request_id: req.requestId ?? null,
      },
    });
  };
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
 * Polling the state of a booking's payment - and what a reloaded client
 * reads to recover where it got to. Read-only, so no Idempotency-Key.
 */
paymentsRouter.get(
  "/bookings/:id/payment",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await service.getPaymentState(req.auth!.sub, req.params.id as string));
  }),
);

/**
 * Co-op Bank's async result callback - the URL given on the Co-op Connect
 * onboarding form (section 3, "Call Back URL"). The shape is confirmed
 * against their OpenAPI document; see coopbank-adapter.ts.
 *
 * Authenticated by HTTP Basic: the form has Co-op call us with a username
 * and password "shared separately", which live in `COOPBANK_CALLBACK_USER`/
 * `_PASSWORD`. Closed (503) in production until both are set.
 *
 * Always parsed as Co-op's format, whatever `PAYMENT_ADAPTER` is: dev runs
 * Daraja for the demo but is also the test URL registered with Co-op.
 */
paymentsRouter.post(
  "/payments/coopbank/callback",
  callbackBasicAuth("COOPBANK_CALLBACK_USER", "COOPBANK_CALLBACK_PASSWORD", true),
  asyncHandler(async (req, res) => {
    await service.handleCallback(req.body, ctxOf(req), parseCoopBankStkCallback);
    // Co-op documents no ack shape for the callback; this is their own
    // vocabulary (MessageCode/MessageDescription). A non-2xx is a retry.
    res.status(200).json({ MessageCode: "0", MessageDescription: "Accepted" });
  }),
);

/**
 * Safaricom Daraja's async STK result. Shape is
 * `{Body:{stkCallback:{...}}}` - parsed by `DarajaPaymentAdapter.
 * parseCallback`, settled by the one copy of the rules in
 * `service.ts#applySettlement`.
 *
 * **This one can actually be authenticated**, unlike Co-op's. Daraja
 * fetches whatever URL you register, so HTTP Basic credentials embedded
 * in that URL come back as an `Authorization` header we can check. Set
 * `DARAJA_CALLBACK_USER`/`DARAJA_CALLBACK_PASSWORD` and register the URL
 * as `https://user:password@host/payments/daraja/callback`.
 *
 * It is enforced whenever those are configured, and `server.ts` refuses
 * to boot in production without them. Left unset in local dev, the
 * endpoint is open - which is the same posture as the Co-op one and is
 * why the amount check in `applySettlement` is not optional.
 */
paymentsRouter.post(
  "/payments/daraja/callback",
  callbackBasicAuth("DARAJA_CALLBACK_USER", "DARAJA_CALLBACK_PASSWORD"),
  asyncHandler(async (req, res) => {
    await service.handleCallback(req.body, ctxOf(req));
    // Daraja retries on a non-2xx, and documents this exact ack shape.
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }),
);


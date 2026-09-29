import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { asyncHandler } from "../../lib/async-handler.js";
import * as service from "./service.js";
import { recordCoopBankIpn } from "./coopbank-ipn.js";
import type { RequestContext } from "./service.js";
import { InitiateStkPushSchema } from "./schemas.js";

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
 * HTTP Basic on the Daraja callback, checked only when configured. A
 * failure returns 401 with no detail - a caller that got this wrong is
 * not one we owe an explanation.
 */
function requireCallbackBasicAuth(req: Request, res: Response, next: NextFunction): void {
  const user = process.env.DARAJA_CALLBACK_USER;
  const password = process.env.DARAJA_CALLBACK_PASSWORD;
  if (!user || !password || basicAuthMatches(req, user, password)) {
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
}

/**
 * HTTP Basic on Co-op's account-event IPN (`COOPBANK_IPN_USER`/
 * `_PASSWORD`, handed to Co-op when the URL is registered). Answers in
 * Co-op's own `{MessageCode, Message}` shape, which is what their sender
 * reads.
 *
 * Unlike the Daraja callback this doesn't stop the API booting in
 * production when unset - nothing acts on these events yet, so a missing
 * credential shouldn't take the rest of the API down. Instead the
 * endpoint refuses everything (503) until it's configured: an open one
 * would let anyone write fake lines into our bank record.
 */
function requireIpnBasicAuth(req: Request, res: Response, next: NextFunction): void {
  const user = process.env.COOPBANK_IPN_USER;
  const password = process.env.COOPBANK_IPN_PASSWORD;
  if (!user || !password) {
    if (process.env.NODE_ENV === "production") {
      res.status(503).json({ MessageCode: "503", Message: "Endpoint not configured." });
      return;
    }
    next();
    return;
  }
  if (!basicAuthMatches(req, user, password)) {
    res.status(401).json({ MessageCode: "401", Message: "Unauthenticated." });
    return;
  }
  next();
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
  requireCallbackBasicAuth,
  asyncHandler(async (req, res) => {
    await service.handleCallback(req.body, ctxOf(req));
    // Daraja retries on a non-2xx, and documents this exact ack shape.
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }),
);

/**
 * Co-op Bank's account-event notification ("B2B IPN"): one POST per debit
 * or credit on CRAL's account. Recorded in `bank_account_events`, deduped
 * on the bank's `TransactionId` - a redelivery is acknowledged, not
 * stored twice. See coopbank-ipn.ts.
 *
 * Co-op treats any non-2xx as a failure and redelivers, so a body we
 * can't read is a 400 (it's worth them retrying or raising it), and
 * anything we've already got is a 200.
 */
paymentsRouter.post(
  "/payments/coopbank/ipn",
  requireIpnBasicAuth,
  asyncHandler(async (req, res) => {
    const result = await recordCoopBankIpn(req.body, ctxOf(req));
    if (!result.ok) {
      console.warn(`[payments] coopbank ipn rejected: ${result.message}`);
      res.status(400).json({ MessageCode: "400", Message: result.message });
      return;
    }
    res.status(200).json({ MessageCode: "200", Message: "Successfully received data" });
  }),
);

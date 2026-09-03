import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { RequestContext } from "../merchant/service.js";
import * as payoutsService from "./service.js";
import { seedDevPayouts } from "./dev-seed.js";
import { CreatePayoutQuerySchema, ListPayoutsQuerySchema, StatementQuerySchema } from "./schemas.js";

export const payoutsRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

// ---------------------------------------------------------------------
// Payout runs
// ---------------------------------------------------------------------

payoutsRouter.get(
  "/merchant/payouts",
  authenticate(),
  asyncHandler(async (req, res) => {
    const query = ListPayoutsQuerySchema.parse(req.query);
    const result = await payoutsService.listPayouts(req.auth!.sub, query);
    res.status(200).json(result);
  }),
);

// ---------------------------------------------------------------------
// Documents
//
// Registered before "/merchant/payouts/:payoutRunId" so the literal
// "statement" segment cannot be captured as a run id.
// ---------------------------------------------------------------------

payoutsRouter.get(
  "/merchant/payouts/statement",
  authenticate(),
  asyncHandler(async (req, res) => {
    const query = StatementQuerySchema.parse(req.query);
    const doc = await payoutsService.buildStatement(req.auth!.sub, query.month);
    res.setHeader("Content-Type", doc.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.filename}"`);
    res.status(200).send(doc.body);
  }),
);

// The months the Statements card lists, with net totals. Registered before
// "/:payoutRunId" so "statements" is not captured as a run id.
payoutsRouter.get(
  "/merchant/payouts/statements",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await payoutsService.listStatements(req.auth!.sub);
    res.status(200).json(result);
  }),
);

payoutsRouter.get(
  "/merchant/payouts/:payoutRunId",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await payoutsService.getPayoutDetail(req.auth!.sub, req.params.payoutRunId as string);
    res.status(200).json(result);
  }),
);

payoutsRouter.get(
  "/merchant/payouts/:payoutRunId/receipt",
  authenticate(),
  asyncHandler(async (req, res) => {
    const doc = await payoutsService.buildReceipt(req.auth!.sub, req.params.payoutRunId as string);
    res.setHeader("Content-Type", doc.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.filename}"`);
    res.status(200).send(doc.body);
  }),
);

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

payoutsRouter.get(
  "/merchant/payouts/:payoutRunId/queries",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await payoutsService.listPayoutQueries(req.auth!.sub, req.params.payoutRunId as string);
    res.status(200).json(result);
  }),
);

// Idempotent by design: this doesn't move money, but a double-submit
// raising two support tickets for one complaint is exactly the duplicate
// the header exists to stop (spec §2).
payoutsRouter.post(
  "/merchant/payouts/:payoutRunId/queries",
  authenticate(),
  requireIdempotencyKey(),
  validateBody(CreatePayoutQuerySchema),
  asyncHandler(async (req, res) => {
    const result = await payoutsService.createPayoutQuery(
      req.auth!.sub,
      req.params.payoutRunId as string,
      req.body,
      ctxOf(req),
    );
    await req.idempotency!.complete(201, result);
    res.status(201).json(result);
  }),
);

// ---------------------------------------------------------------------
// Dev-only fixture seeding — there is no customer portal generating real
// bookings and no payment rail settling real runs, so this is how the
// Payouts screen gets history to render. Never available in production.
// ---------------------------------------------------------------------

if (process.env.NODE_ENV !== "production") {
  payoutsRouter.post(
    "/merchant/payouts/dev-seed",
    authenticate(),
    asyncHandler(async (req, res) => {
      const result = await seedDevPayouts(req.auth!.sub);
      res.status(201).json(result);
    }),
  );
}

import { Router, type Request } from "express";
import { requireAdmin } from "../../middleware/require-admin.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { AdminContextInput } from "./service.js";
import * as admin from "./service.js";
import { DeclineServiceRequestSchema, QueueQuerySchema, QuoteServiceRequestSchema } from "./schemas.js";

export const adminServiceRequestsRouter = Router();

// A new queue, separate from vehicle review - `admin_support` fits the
// dispatch/customer-facing nature of towing better than `admin_reviewer`.
// `admin_super` bypasses both checks (see require-admin.ts).
const guard = requireAdmin({ role: ["admin_support", "admin_reviewer"], queue: "services" });

function ctxOf(req: Request): AdminContextInput {
  return {
    adminId: req.admin!.id,
    adminName: req.admin!.name,
    ip: req.ip ?? null,
    requestId: req.requestId ?? null,
  };
}

adminServiceRequestsRouter.get(
  "/admin/service-requests",
  guard,
  asyncHandler(async (req, res) => {
    const query = QueueQuerySchema.parse(req.query);
    res.status(200).json(await admin.listQueue(query));
  }),
);

adminServiceRequestsRouter.get(
  "/admin/service-requests/:id",
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.getCase(req.params.id as string));
  }),
);

// No Idempotency-Key on any of these three: none of them move money (the
// quote is a figure for a human phone call, not a charge) or complete a
// handover, so the spec's requirement doesn't apply. A double-click just
// re-applies the same quote/decision, which is safe.
adminServiceRequestsRouter.post(
  "/admin/service-requests/:id/quote",
  guard,
  asyncHandler(async (req, res) => {
    const body = QuoteServiceRequestSchema.parse(req.body);
    res.status(200).json(await admin.quoteRequest(req.params.id as string, body, ctxOf(req)));
  }),
);

adminServiceRequestsRouter.post(
  "/admin/service-requests/:id/decline",
  guard,
  asyncHandler(async (req, res) => {
    const body = DeclineServiceRequestSchema.parse(req.body);
    res.status(200).json(await admin.declineRequest(req.params.id as string, body, ctxOf(req)));
  }),
);

adminServiceRequestsRouter.post(
  "/admin/service-requests/:id/complete",
  guard,
  asyncHandler(async (req, res) => {
    res.status(200).json(await admin.completeRequest(req.params.id as string, ctxOf(req)));
  }),
);

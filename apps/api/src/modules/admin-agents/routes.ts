import { Router, type Request } from "express";
import { requireAdmin } from "../../middleware/require-admin.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { asyncHandler } from "../../lib/async-handler.js";
import * as agents from "./service.js";
import { AddMerchantSchema, ListAgentMerchantsQuerySchema } from "./schemas.js";

export const adminAgentsRouter = Router();

// `admin_sales` only - `admin_super` clears it, as on every `/admin/*`
// route. No other role reaches these, and an agent reaches nothing else:
// every other admin router names its own roles, none of which is this one.
const guard = requireAdmin({ role: "admin_sales" });

function ctxOf(req: Request): agents.AgentCtx {
  return {
    adminId: req.admin!.id,
    adminName: req.admin!.name,
    role: req.admin!.role,
    ip: req.ip ?? null,
    requestId: req.requestId ?? null,
  };
}

adminAgentsRouter.get(
  "/admin/agents/merchants",
  guard,
  asyncHandler(async (req, res) => {
    const q = ListAgentMerchantsQuerySchema.parse(req.query);
    const result = await agents.listAgentMerchants(ctxOf(req), q);
    res.status(200).json(result);
  }),
);

// Each add sends an email to someone who didn't ask for it, so it's capped
// per agent. Mounted after `guard`, so the bucket is the admin, not the IP
// a field team may be sharing.
adminAgentsRouter.post(
  "/admin/agents/merchants",
  guard,
  rateLimit({
    bucket: "agent_invite",
    limit: 30,
    windowSeconds: 3600,
    keyFn: (req) => req.admin?.id ?? req.ip ?? "unknown",
  }),
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const body = AddMerchantSchema.parse(req.body);
    const result = await agents.addMerchant(body, ctxOf(req));
    await req.idempotency!.complete(201, result);
    res.status(201).json(result);
  }),
);

adminAgentsRouter.post(
  "/admin/agents/merchants/:id/resend-invite",
  guard,
  rateLimit({
    bucket: "agent_invite_resend",
    limit: 5,
    windowSeconds: 3600,
    keyFn: (req) => `${req.admin?.id ?? req.ip ?? "unknown"}:${String(req.params.id)}`,
  }),
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const result = await agents.resendInvite(req.params.id as string, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

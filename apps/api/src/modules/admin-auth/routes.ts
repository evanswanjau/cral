import { Router, type Request } from "express";
import { ulid } from "ulid";
import { requireAdmin } from "../../middleware/require-admin.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { RequestContext } from "./service.js";
import * as adminAuth from "./service.js";
import { AdminLoginSchema, AdminRefreshSchema, AdminVerifyTwoFactorSchema } from "./schemas.js";

export const adminAuthRouter = Router();

function ctxOf(req: Request): RequestContext {
  return {
    ip: req.ip ?? null,
    requestId: req.requestId ?? null,
    userAgent: req.header("User-Agent") ?? null,
  };
}

// --- §8 Admin authentication ----------------------------------------

adminAuthRouter.post(
  "/admin/auth/login",
  rateLimit({
    bucket: "admin_login",
    limit: 10,
    windowSeconds: 900,
    keyFn: (req) => req.body?.email ?? req.ip ?? "unknown",
  }),
  validateBody(AdminLoginSchema),
  asyncHandler(async (req, res) => {
    const deviceId = req.body.device_id ?? `adm-dev-${ulid()}`;
    const result = await adminAuth.adminLogin(
      req.body.email,
      req.body.password,
      deviceId,
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

adminAuthRouter.post(
  "/admin/auth/2fa",
  rateLimit({
    bucket: "admin_2fa",
    limit: 10,
    windowSeconds: 900,
    keyFn: (req) => req.body?.challenge_token ?? req.ip ?? "unknown",
  }),
  validateBody(AdminVerifyTwoFactorSchema),
  asyncHandler(async (req, res) => {
    const result = await adminAuth.adminVerifyTwoFactor(
      req.body.challenge_token,
      req.body.code,
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

adminAuthRouter.post(
  "/admin/auth/refresh",
  validateBody(AdminRefreshSchema),
  asyncHandler(async (req, res) => {
    const result = await adminAuth.adminRefresh(req.body.refresh_token, ctxOf(req));
    res.status(200).json(result);
  }),
);

adminAuthRouter.get(
  "/admin/auth/me",
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const result = await adminAuth.getAdminMe(req.admin!.id);
    res.status(200).json(result);
  }),
);

adminAuthRouter.post(
  "/admin/auth/logout",
  requireAdmin(),
  asyncHandler(async (req, res) => {
    await adminAuth.adminLogout(req.admin!.id, req.admin!.sessionId, ctxOf(req));
    res.status(204).send();
  }),
);

adminAuthRouter.get(
  "/admin/auth/audit",
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const result = await adminAuth.getAdminOwnAudit(req.admin!.id, cursor, limit);
    res.status(200).json(result);
  }),
);

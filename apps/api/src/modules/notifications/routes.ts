import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { RequestContext } from "../merchant/service.js";
import * as notificationsService from "./service.js";
import { ListNotificationsQuerySchema, UpdateNotificationPreferencesSchema } from "./schemas.js";

export const notificationsRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

// ---------------------------------------------------------------------
// Preferences — registered before "/merchant/notifications/:id/..." isn't
// a concern (different path root), but grouped up top for readability.
// ---------------------------------------------------------------------

notificationsRouter.get(
  "/merchant/notification-preferences",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await notificationsService.getNotificationPreferences(req.auth!.sub));
  }),
);

notificationsRouter.put(
  "/merchant/notification-preferences",
  authenticate(),
  validateBody(UpdateNotificationPreferencesSchema),
  asyncHandler(async (req, res) => {
    const result = await notificationsService.updateNotificationPreferences(req.auth!.sub, req.body, ctxOf(req));
    res.status(200).json(result);
  }),
);

// ---------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------

notificationsRouter.get(
  "/merchant/notifications",
  authenticate(),
  asyncHandler(async (req, res) => {
    const query = ListNotificationsQuerySchema.parse(req.query);
    res.status(200).json(await notificationsService.listNotifications(req.auth!.sub, query));
  }),
);

notificationsRouter.post(
  "/merchant/notifications/read-all",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await notificationsService.markAllNotificationsRead(req.auth!.sub));
  }),
);

notificationsRouter.post(
  "/merchant/notifications/:notificationId/read",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await notificationsService.markNotificationRead(
      req.auth!.sub,
      req.params.notificationId as string,
    );
    res.status(200).json(result);
  }),
);

// ---------------------------------------------------------------------
// The renter's own feed - Migration B, docs/plans/customer-portal.md C8.
// Same shape as the merchant feed above, scoped to the caller's own rows
// instead of a merchant's. No preferences endpoint here - there's no
// renter Settings screen yet to configure one.
// ---------------------------------------------------------------------

notificationsRouter.get(
  "/me/notifications",
  authenticate(),
  asyncHandler(async (req, res) => {
    const query = ListNotificationsQuerySchema.parse(req.query);
    res.status(200).json(await notificationsService.listMyNotifications(req.auth!.sub, query));
  }),
);

notificationsRouter.post(
  "/me/notifications/read-all",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await notificationsService.markAllMyNotificationsRead(req.auth!.sub));
  }),
);

notificationsRouter.post(
  "/me/notifications/:notificationId/read",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await notificationsService.markMyNotificationRead(
      req.auth!.sub,
      req.params.notificationId as string,
    );
    res.status(200).json(result);
  }),
);

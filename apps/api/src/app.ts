import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { requestId } from "./middleware/request-id.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./modules/auth/routes.js";
import { adminAuthRouter } from "./modules/admin-auth/routes.js";
import { adminVehiclesRouter } from "./modules/admin-vehicles/routes.js";
import { adminMerchantsRouter } from "./modules/admin-merchants/routes.js";
import { merchantRouter } from "./modules/merchant/routes.js";
import { vehiclesRouter } from "./modules/vehicles/routes.js";
import { catalogRouter } from "./modules/catalog/routes.js";
import { customerAccountRouter } from "./modules/customer-account/routes.js";
import { bookingsRouter } from "./modules/bookings/routes.js";
import { payoutsRouter } from "./modules/payouts/routes.js";
import { notificationsRouter } from "./modules/notifications/routes.js";
import { dashboardRouter } from "./modules/dashboard/routes.js";

/**
 * Allowed CORS origins. Defaults to the three local Vite dev ports so the
 * apps can talk to a locally-run API without a deploy; CORS_ORIGINS (a
 * comma-separated list) overrides this for staging/production.
 */
function corsOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS;
  if (configured) return configured.split(",").map((o) => o.trim());
  return ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"];
}

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");

  // One proxy hop — the platform edge (Railway/Render both put exactly one
  // in front of the app). Without this `req.ip` is the edge's address,
  // identical for every visitor, which silently turns every IP-keyed
  // rate-limit bucket into a single platform-wide one: five OTP requests an
  // hour for all users combined, ten sign-ups an hour, and no per-IP abuse
  // control at all. Deliberately `1` and not `true` — trusting the whole
  // X-Forwarded-For chain lets a caller spoof its own bucket by prepending
  // an address.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // The API serves JSON and the occasional PDF/CSV/image to a separate
      // origin; it has no pages of its own to frame or script. A restrictive
      // CSP plus COEP would only complicate serving those documents, so take
      // helmet's defaults (nosniff, no-referrer, frameguard, HSTS) and turn
      // off the two that assume an HTML app.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(requestId());
  app.use(
    cors({
      origin: corsOrigins(),
      // Bearer tokens travel in the Authorization header, not cookies —
      // no need for credentialed CORS.
      credentials: false,
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    }),
  );
  app.use(
    pinoHttp({
      genReqId: (req) => req.requestId,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    }),
  );
  app.use(express.json({ limit: "5mb" }));

  app.use(healthRouter);
  app.use(authRouter);
  app.use(adminAuthRouter);
  app.use(adminVehiclesRouter);
  app.use(adminMerchantsRouter);
  app.use(merchantRouter);
  app.use(vehiclesRouter);
  app.use(catalogRouter);
  app.use(customerAccountRouter);
  app.use(bookingsRouter);
  app.use(payoutsRouter);
  app.use(notificationsRouter);
  app.use(dashboardRouter);

  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}

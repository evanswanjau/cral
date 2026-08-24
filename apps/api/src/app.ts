import express, { type Express } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { requestId } from "./middleware/request-id.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./modules/auth/routes.js";

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

  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}

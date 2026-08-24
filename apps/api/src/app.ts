import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import { requestId } from "./middleware/request-id.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestId());
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

  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}

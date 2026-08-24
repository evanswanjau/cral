import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError, type ErrorEnvelope } from "@cral/types";

/**
 * Turns any thrown error into the single error envelope shape from spec §2.
 * Must be registered last, after every route and other middleware.
 */
export function errorHandler() {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = req.requestId ?? "req_unknown";

    if (err instanceof ApiError) {
      const body: ErrorEnvelope = {
        error: {
          type: err.type,
          code: err.code,
          message: err.message,
          field: err.field,
          doc_url: err.docUrl,
          request_id: requestId,
        },
      };
      res.status(err.status).json(body);
      return;
    }

    if (err instanceof ZodError) {
      const first = err.issues[0];
      const body: ErrorEnvelope = {
        error: {
          type: "validation_error",
          code: "invalid_request",
          message: first?.message ?? "The request could not be validated.",
          field: first?.path.join("."),
          request_id: requestId,
        },
      };
      res.status(422).json(body);
      return;
    }

    req.log?.error({ err }, "unhandled error");

    const body: ErrorEnvelope = {
      error: {
        type: "server_error",
        code: "internal_error",
        message: "Something went wrong on our end. Please try again.",
        request_id: requestId,
      },
    };
    res.status(500).json(body);
  };
}

/** 404 handler for routes that don't match anything — kept in the same shape as every other error. */
export function notFoundHandler() {
  return (req: Request, res: Response): void => {
    const body: ErrorEnvelope = {
      error: {
        type: "not_found",
        code: "route_not_found",
        message: `No route matches ${req.method} ${req.path}.`,
        request_id: req.requestId ?? "req_unknown",
      },
    };
    res.status(404).json(body);
  };
}

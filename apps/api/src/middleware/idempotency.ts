import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { ApiError } from "@cral/types";
import { db } from "../db/client.js";

const REPLAY_WINDOW_HOURS = 24;

function hashBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
}

/**
 * Enforces the Idempotency-Key contract from spec §2: required on every
 * POST that moves money or completes a handover. A replay within 24h of the
 * same key + route returns the original response verbatim and never repeats
 * the side effect. Mount this only on routes that need it, not globally.
 *
 * Usage: the route handler calls `req.idempotency.complete(status, body)`
 * once it has produced a response, so the middleware can persist it for
 * future replays. Until that happens the row exists with a null status,
 * which lets a concurrent replay fail fast instead of racing the handler.
 *
 * Keys are scoped to the authenticated caller (migration
 * `20260905090000`). The namespace used to be global across merchants, so
 * two callers generating the same key on the same route collided and the
 * second was served the first's response body — see that migration.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      idempotency?: {
        complete(status: number, body: unknown): Promise<void>;
      };
    }
  }
}

export function requireIdempotencyKey() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header("Idempotency-Key");
    if (!key) {
      next(
        new ApiError({
          status: 400,
          type: "validation_error",
          code: "idempotency_key_required",
          message: "This request must include an Idempotency-Key header.",
        }),
      );
      return;
    }

    const route = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`;
    const requestHash = hashBody(req.body);
    // Every route this is mounted on sits behind `authenticate()`, so `sub`
    // is present in practice. The sentinel keeps the column NOT NULL (and
    // usable in the primary key) if it is ever mounted on an open route.
    const userId = req.auth?.sub ?? "anonymous";
    const scope = { user_id: userId, key, route };

    const existing = await db("idempotency_keys").where(scope).first();

    if (existing) {
      if (existing.request_hash !== requestHash) {
        next(
          new ApiError({
            status: 409,
            type: "conflict",
            code: "idempotency_conflict",
            message: "This Idempotency-Key was already used with a different request body.",
          }),
        );
        return;
      }
      if (existing.response_status === null) {
        next(
          new ApiError({
            status: 409,
            type: "conflict",
            code: "idempotency_in_progress",
            message: "The original request with this Idempotency-Key is still being processed.",
          }),
        );
        return;
      }
      res.status(existing.response_status).json(existing.response_body);
      return;
    }

    const expiresAt = new Date(Date.now() + REPLAY_WINDOW_HOURS * 60 * 60 * 1000);
    await db("idempotency_keys").insert({
      ...scope,
      request_hash: requestHash,
      response_status: null,
      response_body: null,
      expires_at: expiresAt,
    });

    req.idempotency = {
      async complete(status: number, body: unknown) {
        await db("idempotency_keys")
          .where(scope)
          .update({ response_status: status, response_body: JSON.stringify(body) });
      },
    };

    next();
  };
}

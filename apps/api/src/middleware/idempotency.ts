import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { ApiError } from "@cral/types";
import { db } from "../db/client.js";

const REPLAY_WINDOW_HOURS = 24;

/**
 * How long a claimed-but-unfinished key stays claimed.
 *
 * The row is written with a null status *before* the handler runs, so a
 * concurrent replay can fail fast instead of racing it. If the process dies
 * mid-handler that row is never resolved, and without a lease every later
 * retry of that key would get `idempotency_in_progress` forever. Sixty
 * seconds is comfortably longer than any handler here and short enough that
 * a merchant retrying by hand isn't stuck.
 */
const IN_FLIGHT_LEASE_SECONDS = 60;

const PK = ["user_id", "key", "route"] as const;

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
 * future replays.
 *
 * Keys are scoped to the authenticated caller (migration
 * `20260905090000`). The namespace used to be global across merchants, so
 * two callers generating the same key on the same route collided and the
 * second was served the first's response body — see that migration.
 *
 * Only *successful* requests are stored. A handler that throws releases its
 * key so the caller can retry: replaying someone's transient database error
 * back at them for 24h is not idempotency, it is a wedged account. That is
 * also why the 24h window is now actually enforced on read — it was written
 * to `expires_at` and never checked, so in practice a key replayed forever.
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
    // Every route this is mounted on sits behind `authenticate()` (public
    // audience) or `requireAdmin()` (ops audience), so one of these is
    // present in practice. Keys are scoped per actor so two callers can't
    // collide on the same key + route. The sentinel keeps the column NOT
    // NULL if it is ever mounted on an open route.
    const userId = req.auth?.sub ?? req.admin?.id ?? "anonymous";
    const scope = { user_id: userId, key, route };

    const now = new Date();

    // Only a row inside its replay window counts. An expired one is dead
    // weight until the daily sweep collects it, and is overwritten below.
    const existing = await db("idempotency_keys").where(scope).where("expires_at", ">", now).first();

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
        // Claimed but unresolved. Try to take the lease over — one atomic
        // conditional update, so two racing retries can't both win it.
        const staleBefore = new Date(now.getTime() - IN_FLIGHT_LEASE_SECONDS * 1000);
        const claimed = await db("idempotency_keys")
          .where(scope)
          .whereNull("response_status")
          .where("created_at", "<", staleBefore)
          .update({ created_at: now, request_hash: requestHash });

        if (claimed === 0) {
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

        attachHandle(req, res, scope);
        next();
        return;
      }

      res.status(existing.response_status).json(existing.response_body);
      return;
    }

    // No live row: either nothing was ever written under this key, or what
    // was written has expired. `merge` covers both — a plain insert would
    // hit the primary key on the expired row.
    const expiresAt = new Date(now.getTime() + REPLAY_WINDOW_HOURS * 60 * 60 * 1000);
    await db("idempotency_keys")
      .insert({
        ...scope,
        request_hash: requestHash,
        response_status: null,
        response_body: null,
        created_at: now,
        expires_at: expiresAt,
      })
      .onConflict([...PK])
      .merge({
        request_hash: requestHash,
        response_status: null,
        response_body: null,
        created_at: now,
        expires_at: expiresAt,
      });

    attachHandle(req, res, scope);
    next();
  };
}

/**
 * Hands the route its `complete()` and arms the release.
 *
 * `finish` fires once the response is flushed, whatever produced it. If the
 * handler never called `complete()` by then it did not succeed — it threw,
 * or answered with an error — so the key is released rather than left
 * claimed. Without this a single transient failure made that key answer
 * `idempotency_in_progress` for good.
 */
function attachHandle(req: Request, res: Response, scope: Record<string, string>): void {
  let completed = false;

  req.idempotency = {
    async complete(status: number, body: unknown) {
      completed = true;
      await db("idempotency_keys")
        .where(scope)
        .update({ response_status: status, response_body: JSON.stringify(body) });
    },
  };

  res.on("finish", () => {
    if (completed) return;
    // Fire and forget: the response has already gone out, and failing to
    // tidy up must not take the process down. The lease above is the
    // backstop if this delete never lands.
    void db("idempotency_keys")
      .where(scope)
      .whereNull("response_status")
      .delete()
      .catch((error: unknown) => {
        req.log?.warn({ err: error, scope }, "failed to release an unresolved idempotency key");
      });
  });
}

/**
 * Drops keys past their replay window. Called from the daily sweep — the
 * table had no collection at all, so it grew for the life of the
 * deployment.
 */
export async function purgeExpiredIdempotencyKeys(): Promise<number> {
  return db("idempotency_keys").where("expires_at", "<=", new Date()).delete();
}

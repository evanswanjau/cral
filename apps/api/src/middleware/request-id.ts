import type { NextFunction, Request, Response } from "express";
import { ulid } from "ulid";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Every response carries Cral-Request-Id (spec §2) — the key into the audit
 * log and what support tickets quote. Must run before every other
 * middleware that might log or error.
 */
export function requestId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = `req_${ulid()}`;
    req.requestId = id;
    res.setHeader("Cral-Request-Id", id);
    next();
  };
}

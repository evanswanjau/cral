import type { NextFunction, Request, Response } from "express";
import { ApiError } from "@cral/types";
import { verifyAccessToken, type AccessTokenClaims } from "../lib/jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenClaims;
    }
  }
}

/** Requires a valid Authorization: Bearer <access_token> (spec §2). */
export function authenticate() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    if (!token) {
      next(
        new ApiError({
          status: 401,
          type: "auth_error",
          code: "authentication_required",
          message: "This request requires a valid access token.",
        }),
      );
      return;
    }

    try {
      req.auth = verifyAccessToken(token);
      next();
    } catch {
      next(
        new ApiError({
          status: 401,
          type: "auth_error",
          code: "invalid_access_token",
          message: "Your session has expired. Please sign in again.",
        }),
      );
    }
  };
}

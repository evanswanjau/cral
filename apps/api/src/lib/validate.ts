import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

/** Parses req.body against `schema`; a ZodError propagates to the shared error-handler as a 422. */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body);
    next();
  };
}

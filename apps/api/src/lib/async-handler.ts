import type { NextFunction, Request, Response } from "express";

/** Express 4 doesn't catch rejected promises from async handlers on its own — this bridges that to the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

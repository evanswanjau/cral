import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import * as dashboardService from "./service.js";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/merchant/dashboard",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await dashboardService.getDashboard(req.auth!.sub);
    res.status(200).json(result);
  }),
);

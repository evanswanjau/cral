import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../../middleware/require-admin.js";
import { asyncHandler } from "../../lib/async-handler.js";
import * as admin from "./service.js";

export const adminBookingsRouter = Router();

// "Bookings" in the console nav was scoped to admin_support from the
// start (a support conversation needs to see a booking's state before
// anything else) - kept in step with that, not the admin_reviewer role
// vehicles/merchants/renters use.
const guard = requireAdmin({ role: "admin_support", queue: "bookings" });

const ListQuerySchema = z.object({
  status: z.enum(["requested", "confirmed", "active", "completed", "declined", "expired", "cancelled"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

adminBookingsRouter.get(
  "/admin/bookings",
  guard,
  asyncHandler(async (req, res) => {
    const q = ListQuerySchema.parse(req.query);
    const result = await admin.listAdminBookings({
      limit: q.limit,
      ...(q.status ? { status: q.status } : {}),
      ...(q.cursor ? { cursor: q.cursor } : {}),
    });
    res.status(200).json(result);
  }),
);

adminBookingsRouter.get(
  "/admin/bookings/:id",
  guard,
  asyncHandler(async (req, res) => {
    const result = await admin.getAdminBooking(req.params.id as string);
    res.status(200).json(result);
  }),
);

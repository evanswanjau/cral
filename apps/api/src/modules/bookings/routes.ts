import { Router, type Request } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/authenticate.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { ApiError } from "@cral/types";
import type { RequestContext } from "../merchant/service.js";
import * as bookingsService from "./service.js";
import { seedDevBookings } from "./dev-seed.js";
import {
  CancelBookingSchema,
  CreateBookingReportSchema,
  CreateHandoverSchema,
  DeclineBookingSchema,
  HandoverConditionSchema,
  ListBookingsQuerySchema,
  RateHirerSchema,
  VerifyHandoverOtpSchema,
} from "./schemas.js";

export const bookingsRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // matches vehicles/routes.ts's document upload limit
});

// ---------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------

bookingsRouter.get(
  "/merchant/bookings",
  authenticate(),
  asyncHandler(async (req, res) => {
    const query = ListBookingsQuerySchema.parse(req.query);
    const result = await bookingsService.listBookings(req.auth!.sub, query);
    res.status(200).json(result);
  }),
);

bookingsRouter.get(
  "/merchant/bookings/:bookingId",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.getBookingDetail(req.auth!.sub, req.params.bookingId as string);
    res.status(200).json(result);
  }),
);

bookingsRouter.post(
  "/merchant/bookings/:bookingId/confirm",
  authenticate(),
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.confirmBooking(req.auth!.sub, req.params.bookingId as string, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

bookingsRouter.post(
  "/merchant/bookings/:bookingId/decline",
  authenticate(),
  requireIdempotencyKey(),
  validateBody(DeclineBookingSchema),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.declineBooking(req.auth!.sub, req.params.bookingId as string, req.body, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

bookingsRouter.post(
  "/merchant/bookings/:bookingId/cancel",
  authenticate(),
  requireIdempotencyKey(),
  validateBody(CancelBookingSchema),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.cancelBooking(req.auth!.sub, req.params.bookingId as string, req.body, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

// ---------------------------------------------------------------------
// Handover
// ---------------------------------------------------------------------

bookingsRouter.post(
  "/merchant/bookings/:bookingId/handovers",
  authenticate(),
  validateBody(CreateHandoverSchema),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.createHandover(req.auth!.sub, req.params.bookingId as string, req.body, ctxOf(req));
    res.status(201).json(result);
  }),
);

bookingsRouter.get(
  "/merchant/handovers/:handoverId",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.getHandover(req.auth!.sub, req.params.handoverId as string);
    res.status(200).json(result);
  }),
);

bookingsRouter.post(
  "/merchant/handovers/:handoverId/photos",
  authenticate(),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ApiError({ status: 422, type: "validation_error", code: "file_required", message: "Attach a photo.", field: "file" });
    }
    const result = await bookingsService.uploadHandoverPhoto(req.auth!.sub, req.params.handoverId as string, {
      file: { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size },
    });
    res.status(201).json(result);
  }),
);

bookingsRouter.post(
  "/merchant/handovers/:handoverId/otp/verify",
  authenticate(),
  validateBody(VerifyHandoverOtpSchema),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.verifyHandoverOtp(req.auth!.sub, req.params.handoverId as string, req.body, ctxOf(req));
    res.status(200).json(result);
  }),
);

bookingsRouter.post(
  "/merchant/handovers/:handoverId/condition",
  authenticate(),
  validateBody(HandoverConditionSchema),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.logHandoverCondition(req.auth!.sub, req.params.handoverId as string, req.body, ctxOf(req));
    res.status(200).json(result);
  }),
);

bookingsRouter.post(
  "/merchant/handovers/:handoverId/confirm",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.confirmHandover(req.auth!.sub, req.params.handoverId as string, ctxOf(req));
    res.status(200).json(result);
  }),
);

bookingsRouter.post(
  "/merchant/handovers/:handoverId/complete",
  authenticate(),
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.completeHandover(req.auth!.sub, req.params.handoverId as string, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

// ---------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------

bookingsRouter.get(
  "/merchant/bookings/:bookingId/reports",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.listBookingReports(req.auth!.sub, req.params.bookingId as string);
    res.status(200).json(result);
  }),
);

bookingsRouter.post(
  "/merchant/bookings/:bookingId/reports",
  authenticate(),
  requireIdempotencyKey(),
  validateBody(CreateBookingReportSchema),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.createBookingReport(req.auth!.sub, req.params.bookingId as string, req.body, ctxOf(req));
    await req.idempotency!.complete(201, result);
    res.status(201).json(result);
  }),
);

// ---------------------------------------------------------------------
// Hirer history
// ---------------------------------------------------------------------

bookingsRouter.get(
  "/merchant/bookings/:bookingId/hirer-history",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.getHirerHistory(req.auth!.sub, req.params.bookingId as string);
    res.status(200).json(result);
  }),
);

// ---------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------

bookingsRouter.post(
  "/merchant/bookings/:bookingId/rating",
  authenticate(),
  validateBody(RateHirerSchema),
  asyncHandler(async (req, res) => {
    const result = await bookingsService.rateHirer(req.auth!.sub, req.params.bookingId as string, req.body, ctxOf(req));
    res.status(201).json(result);
  }),
);

// ---------------------------------------------------------------------
// Dev-only fixture seeding — there is no customer portal yet to create
// real requests, so this is how the merchant portal's Bookings screen
// gets something to show. Never available in production.
// ---------------------------------------------------------------------

if (process.env.NODE_ENV !== "production") {
  bookingsRouter.post(
    "/merchant/bookings/dev-seed",
    authenticate(),
    asyncHandler(async (req, res) => {
      const result = await seedDevBookings(req.auth!.sub);
      res.status(201).json(result);
    }),
  );
}

import { Router, type Request } from "express";
import multer from "multer";
import { ApiError } from "@cral/types";
import { authenticate } from "../../middleware/authenticate.js";
import { requireIdempotencyKey } from "../../middleware/idempotency.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { RequestContext } from "../merchant/service.js";
import * as vehiclesService from "./service.js";
import {
  CreateVehicleSchema,
  DeleteVehicleSchema,
  ListVehiclesQuerySchema,
  MessageReviewerSchema,
  PriceAvailabilitySchema,
  UploadVehicleDocumentQuerySchema,
} from "./schemas.js";

export const vehiclesRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // matches merchant/routes.ts's onboarding document limit
});

vehiclesRouter.get(
  "/merchant/vehicles",
  authenticate(),
  asyncHandler(async (req, res) => {
    const query = ListVehiclesQuerySchema.parse(req.query);
    const result = await vehiclesService.listVehicles(req.auth!.sub, query);
    res.status(200).json(result);
  }),
);

vehiclesRouter.post(
  "/merchant/vehicles",
  authenticate(),
  validateBody(CreateVehicleSchema),
  asyncHandler(async (req, res) => {
    const result = await vehiclesService.createVehicle(req.auth!.sub, req.body, ctxOf(req));
    res.status(201).json(result);
  }),
);

vehiclesRouter.get(
  "/merchant/vehicles/:vehicleId",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await vehiclesService.getVehicleDetail(req.auth!.sub, req.params.vehicleId as string);
    res.status(200).json(result);
  }),
);

vehiclesRouter.patch(
  "/merchant/vehicles/:vehicleId",
  authenticate(),
  validateBody(PriceAvailabilitySchema),
  asyncHandler(async (req, res) => {
    const result = await vehiclesService.updatePriceAvailability(
      req.auth!.sub,
      req.params.vehicleId as string,
      req.body,
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

vehiclesRouter.delete(
  "/merchant/vehicles/:vehicleId",
  authenticate(),
  validateBody(DeleteVehicleSchema),
  asyncHandler(async (req, res) => {
    await vehiclesService.deleteVehicle(req.auth!.sub, req.params.vehicleId as string, req.body, ctxOf(req));
    res.status(204).send();
  }),
);

vehiclesRouter.post(
  "/merchant/vehicles/:vehicleId/submit",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await vehiclesService.submitVehicle(req.auth!.sub, req.params.vehicleId as string, ctxOf(req));
    res.status(200).json(result);
  }),
);

vehiclesRouter.post(
  "/merchant/vehicles/:vehicleId/pause",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await vehiclesService.pauseVehicle(req.auth!.sub, req.params.vehicleId as string, ctxOf(req));
    res.status(200).json(result);
  }),
);

vehiclesRouter.post(
  "/merchant/vehicles/:vehicleId/resume",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await vehiclesService.resumeVehicle(req.auth!.sub, req.params.vehicleId as string, ctxOf(req));
    res.status(200).json(result);
  }),
);

vehiclesRouter.post(
  "/merchant/vehicles/:vehicleId/duplicate",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await vehiclesService.duplicateVehicle(req.auth!.sub, req.params.vehicleId as string, ctxOf(req));
    res.status(201).json(result);
  }),
);

vehiclesRouter.post(
  "/merchant/vehicles/:vehicleId/messages",
  authenticate(),
  validateBody(MessageReviewerSchema),
  asyncHandler(async (req, res) => {
    const result = await vehiclesService.messageReviewer(
      req.auth!.sub,
      req.params.vehicleId as string,
      req.body,
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

// Money-shaped even though nothing is charged yet (see service.ts's note) —
// per spec §2, every POST that moves money requires Idempotency-Key.
vehiclesRouter.post(
  "/merchant/vehicles/:vehicleId/verification",
  authenticate(),
  requireIdempotencyKey(),
  asyncHandler(async (req, res) => {
    const result = await vehiclesService.requestVerification(req.auth!.sub, req.params.vehicleId as string, ctxOf(req));
    await req.idempotency!.complete(200, result);
    res.status(200).json(result);
  }),
);

vehiclesRouter.post(
  "/merchant/vehicles/:vehicleId/documents",
  authenticate(),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const parsed = UploadVehicleDocumentQuerySchema.parse(req.body);
    if (!req.file) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "file_required",
        message: "Attach a file.",
        field: "file",
      });
    }
    const result = await vehiclesService.uploadVehicleDocument(
      req.auth!.sub,
      req.params.vehicleId as string,
      {
        kind: parsed.kind,
        expiresAt: parsed.expires_at,
        file: {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
      },
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

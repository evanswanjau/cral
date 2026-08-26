import { Router, type Request } from "express";
import multer from "multer";
import { ApiError } from "@cral/types";
import { authenticate } from "../../middleware/authenticate.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import type { RequestContext } from "./service.js";
import * as merchantService from "./service.js";
import {
  CreateVehicleSchema,
  PatchOnboardingSchema,
  UploadDocumentQuerySchema,
  VehicleInputSchema,
} from "./schemas.js";

export const merchantRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // matches Documents.tsx's MAX_DOC_BYTES
});

// --- §9 Merchant onboarding --------------------------------------------

merchantRouter.get(
  "/merchant/onboarding",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await merchantService.getOnboardingState(req.auth!.sub);
    res.status(200).json(result);
  }),
);

merchantRouter.patch(
  "/merchant/onboarding",
  authenticate(),
  validateBody(PatchOnboardingSchema),
  asyncHandler(async (req, res) => {
    const result = await merchantService.patchOnboarding(req.auth!.sub, req.body, ctxOf(req));
    res.status(200).json(result);
  }),
);

merchantRouter.post(
  "/merchant/onboarding/vehicles",
  authenticate(),
  validateBody(CreateVehicleSchema),
  asyncHandler(async (req, res) => {
    const result = await merchantService.addVehicle(req.auth!.sub, req.body, ctxOf(req));
    res.status(201).json(result);
  }),
);

merchantRouter.patch(
  "/merchant/onboarding/vehicles/:vehicleId",
  authenticate(),
  validateBody(VehicleInputSchema),
  asyncHandler(async (req, res) => {
    const result = await merchantService.patchVehicle(
      req.auth!.sub,
      req.params.vehicleId as string,
      req.body,
      ctxOf(req),
    );
    res.status(200).json(result);
  }),
);

merchantRouter.delete(
  "/merchant/onboarding/vehicles/:vehicleId",
  authenticate(),
  asyncHandler(async (req, res) => {
    await merchantService.removeVehicle(req.auth!.sub, req.params.vehicleId as string, ctxOf(req));
    res.status(204).send();
  }),
);

merchantRouter.post(
  "/merchant/onboarding/documents",
  authenticate(),
  rateLimit({ bucket: "onboarding_upload", limit: 60, windowSeconds: 3600 }),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const parsed = UploadDocumentQuerySchema.parse(req.body);
    if (!req.file) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "file_required",
        message: "Attach a file.",
        field: "file",
      });
    }
    const result = await merchantService.uploadDocument(
      req.auth!.sub,
      {
        kind: parsed.kind,
        vehicleId: parsed.vehicle_id,
        file: {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
      },
      ctxOf(req),
    );
    res.status(201).json(result);
  }),
);

// Serves a document's bytes back to its owner. Authenticated like every
// other route (no token in the URL), so the merchant app fetches this with
// its bearer token and turns the blob into an object URL for display.
merchantRouter.get(
  "/merchant/onboarding/documents/:documentId",
  authenticate(),
  asyncHandler(async (req, res) => {
    const doc = await merchantService.readDocument(
      req.auth!.sub,
      req.params.documentId as string,
    );
    res.setHeader("Content-Type", doc.contentType);
    // Per-user content behind a bearer token — never let a shared cache
    // hold it, but let the browser reuse it for the session.
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalName)}"`);
    res.status(200).send(doc.body);
  }),
);

merchantRouter.delete(
  "/merchant/onboarding/documents/:documentId",
  authenticate(),
  asyncHandler(async (req, res) => {
    await merchantService.deleteDocument(req.auth!.sub, req.params.documentId as string, ctxOf(req));
    res.status(204).send();
  }),
);

merchantRouter.post(
  "/merchant/onboarding/submit",
  authenticate(),
  asyncHandler(async (req, res) => {
    const result = await merchantService.submitOnboarding(req.auth!.sub, ctxOf(req));
    res.status(200).json(result);
  }),
);

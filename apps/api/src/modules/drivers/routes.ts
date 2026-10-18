import { Router, type Request } from "express";
import { ApiError } from "@cral/types";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { assertDeclaredTypeMatchesBytes, createUpload } from "../../lib/uploads.js";
import type { RequestContext } from "../merchant/service.js";
import * as drivers from "./service.js";
import {
  CreateDriverSchema,
  ListDriversQuerySchema,
  UpdateDriverSchema,
  UploadDriverDocumentSchema,
} from "./schemas.js";

/** Merchant drivers - openapi/merchant-drivers.yaml. */
export const driversRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

const upload = createUpload();

driversRouter.get(
  "/merchant/drivers",
  authenticate(),
  asyncHandler(async (req, res) => {
    const query = ListDriversQuerySchema.parse(req.query);
    res.status(200).json(await drivers.listDrivers(req.auth!.sub, query));
  }),
);

driversRouter.post(
  "/merchant/drivers",
  authenticate(),
  validateBody(CreateDriverSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await drivers.createDriver(req.auth!.sub, req.body, ctxOf(req)));
  }),
);

driversRouter.get(
  "/merchant/drivers/:driverId",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await drivers.getDriver(req.auth!.sub, req.params.driverId as string));
  }),
);

driversRouter.patch(
  "/merchant/drivers/:driverId",
  authenticate(),
  validateBody(UpdateDriverSchema),
  asyncHandler(async (req, res) => {
    res
      .status(200)
      .json(await drivers.updateDriver(req.auth!.sub, req.params.driverId as string, req.body, ctxOf(req)));
  }),
);

driversRouter.delete(
  "/merchant/drivers/:driverId",
  authenticate(),
  asyncHandler(async (req, res) => {
    await drivers.deleteDriver(req.auth!.sub, req.params.driverId as string, ctxOf(req));
    res.status(204).send();
  }),
);

driversRouter.post(
  "/merchant/drivers/:driverId/documents",
  authenticate(),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const parsed = UploadDriverDocumentSchema.parse(req.body);
    if (!req.file) {
      throw new ApiError({
        status: 422,
        type: "validation_error",
        code: "file_required",
        message: "Attach a file.",
        field: "file",
      });
    }
    assertDeclaredTypeMatchesBytes(req.file.buffer, req.file.mimetype);
    const result = await drivers.uploadDriverDocument(
      req.auth!.sub,
      req.params.driverId as string,
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

driversRouter.post(
  "/merchant/drivers/:driverId/submit",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await drivers.submitDriver(req.auth!.sub, req.params.driverId as string, ctxOf(req)));
  }),
);

driversRouter.post(
  "/merchant/drivers/:driverId/pause",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await drivers.pauseDriver(req.auth!.sub, req.params.driverId as string, ctxOf(req)));
  }),
);

driversRouter.post(
  "/merchant/drivers/:driverId/resume",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await drivers.resumeDriver(req.auth!.sub, req.params.driverId as string, ctxOf(req)));
  }),
);

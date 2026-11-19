import { Router, type Request, type Response } from "express";
import { ApiError } from "@cral/types";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { assertDeclaredTypeMatchesBytes, createUpload, safeContentType, safeDisposition } from "../../lib/uploads.js";
import type { RequestContext } from "../merchant/service.js";
import * as outlets from "./service.js";
import { CreateOutletSchema, ListOutletsQuerySchema, UpdateOutletSchema } from "./schemas.js";

/** Merchant outlets ("Your premises") - openapi/merchant-outlets.yaml. */
export const outletsRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

const upload = createUpload();
const id = (req: Request) => req.params.outletId as string;

export function sendPhoto(res: Response, doc: { body: Buffer; contentType: string; originalName: string }): void {
  res.setHeader("Content-Type", safeContentType(doc.contentType));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("Content-Disposition", `${safeDisposition(doc.contentType)}; filename="${encodeURIComponent(doc.originalName)}"`);
  res.status(200).send(doc.body);
}

outletsRouter.get(
  "/merchant/outlets",
  authenticate(),
  asyncHandler(async (req, res) => {
    const query = ListOutletsQuerySchema.parse(req.query);
    res.status(200).json(await outlets.listOutlets(req.auth!.sub, query));
  }),
);

outletsRouter.post(
  "/merchant/outlets",
  authenticate(),
  validateBody(CreateOutletSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await outlets.createOutlet(req.auth!.sub, req.body, ctxOf(req)));
  }),
);

outletsRouter.get(
  "/merchant/outlets/:outletId",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await outlets.getOutlet(req.auth!.sub, id(req)));
  }),
);

outletsRouter.patch(
  "/merchant/outlets/:outletId",
  authenticate(),
  validateBody(UpdateOutletSchema),
  asyncHandler(async (req, res) => {
    res.status(200).json(await outlets.updateOutlet(req.auth!.sub, id(req), req.body, ctxOf(req)));
  }),
);

outletsRouter.delete(
  "/merchant/outlets/:outletId",
  authenticate(),
  asyncHandler(async (req, res) => {
    await outlets.deleteOutlet(req.auth!.sub, id(req), ctxOf(req));
    res.status(204).send();
  }),
);

outletsRouter.post(
  "/merchant/outlets/:outletId/photos",
  authenticate(),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ApiError({ status: 422, type: "validation_error", code: "file_required", message: "Attach a photo.", field: "file" });
    }
    assertDeclaredTypeMatchesBytes(req.file.buffer, req.file.mimetype);
    const result = await outlets.uploadOutletPhoto(
      req.auth!.sub,
      id(req),
      {
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

outletsRouter.get(
  "/merchant/outlets/:outletId/photos/:photoId",
  authenticate(),
  asyncHandler(async (req, res) => {
    sendPhoto(res, await outlets.readOwnOutletPhoto(req.auth!.sub, id(req), req.params.photoId as string));
  }),
);

outletsRouter.delete(
  "/merchant/outlets/:outletId/photos/:photoId",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await outlets.deleteOutletPhoto(req.auth!.sub, id(req), req.params.photoId as string, ctxOf(req)));
  }),
);

outletsRouter.post(
  "/merchant/outlets/:outletId/submit",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await outlets.submitOutlet(req.auth!.sub, id(req), ctxOf(req)));
  }),
);

outletsRouter.post(
  "/merchant/outlets/:outletId/pause",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await outlets.pauseOutlet(req.auth!.sub, id(req), ctxOf(req)));
  }),
);

outletsRouter.post(
  "/merchant/outlets/:outletId/resume",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await outlets.resumeOutlet(req.auth!.sub, id(req), ctxOf(req)));
  }),
);

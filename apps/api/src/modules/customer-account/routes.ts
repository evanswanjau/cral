import { Router } from "express";
import { ApiError } from "@cral/types";
import { authenticate } from "../../middleware/authenticate.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { asyncHandler } from "../../lib/async-handler.js";
import {
  assertDeclaredTypeMatchesBytes,
  createUpload,
  safeContentType,
  safeDisposition,
} from "../../lib/uploads.js";
import { z } from "zod";
import { setUserPhone } from "../../lib/user-phone.js";
import { validateBody } from "../../lib/validate.js";
import * as service from "./service.js";
import { UploadRenterDocumentSchema } from "./schemas.js";

export const customerAccountRouter = Router();

const upload = createUpload();

/**
 * Renter documents (docs/plans/customer-portal.md). The renter uploads an
 * ID and a driving licence before requesting a booking; Ops accepts them
 * in the admin renters queue (PR 7) before pickup keys change hands. Same
 * upload policy (`createUpload` / `assertDeclaredTypeMatchesBytes`) and the
 * same authenticated byte-serving as the merchant onboarding route - one
 * `documents` table, one review vocabulary.
 */
customerAccountRouter.post(
  "/me/documents",
  authenticate(),
  rateLimit({ bucket: "renter_doc_upload", limit: 60, windowSeconds: 3600 }),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const parsed = UploadRenterDocumentSchema.parse(req.body);
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
    const result = await service.uploadRenterDocument(req.auth!.sub, {
      kind: parsed.kind,
      expiresAt: parsed.expires_at,
      file: {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
    });
    res.status(201).json(result);
  }),
);

customerAccountRouter.get(
  "/me/documents",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await service.listRenterDocuments(req.auth!.sub));
  }),
);

customerAccountRouter.get(
  "/me/documents/:documentId",
  authenticate(),
  asyncHandler(async (req, res) => {
    const doc = await service.readRenterDocument(
      req.auth!.sub,
      req.params.documentId as string,
    );
    res.setHeader("Content-Type", safeContentType(doc.contentType));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader(
      "Content-Disposition",
      `${safeDisposition(doc.contentType)}; filename="${encodeURIComponent(doc.originalName)}"`,
    );
    res.status(200).send(doc.body);
  }),
);

/**
 * Correcting the contact number before verifying it. A renter types their
 * phone once during the booking sign-up, so a typo has to be fixable
 * without support - otherwise the verification SMS goes to a number they
 * can't reach and the booking is stuck. `setUserPhone` clears
 * `phone_verified`, so a changed number always has to be proven again.
 */
customerAccountRouter.patch(
  "/me/phone",
  authenticate(),
  rateLimit({ bucket: "renter_phone_change", limit: 10, windowSeconds: 3600 }),
  validateBody(z.object({ phone: z.string().min(9).max(20) })),
  asyncHandler(async (req, res) => {
    await setUserPhone(req.auth!.sub, req.body.phone);
    res.status(200).json(await service.getRenterVerification(req.auth!.sub));
  }),
);

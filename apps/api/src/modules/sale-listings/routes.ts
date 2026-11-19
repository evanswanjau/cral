import { Router, type Request } from "express";
import { ApiError } from "@cral/types";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { assertDeclaredTypeMatchesBytes, createUpload } from "../../lib/uploads.js";
import type { RequestContext } from "../merchant/service.js";
import { sendPhoto } from "../outlets/routes.js";
import * as sales from "./service.js";
import {
  CreateSaleListingSchema,
  ListSaleListingsQuerySchema,
  SetSaleStatusSchema,
  UpdateSaleListingSchema,
  UploadSaleFileSchema,
} from "./schemas.js";

/**
 * Merchant sale listings ("Cars for sale") - openapi/merchant-sales.yaml.
 * Nothing here moves money, so no Idempotency-Key.
 */
export const saleListingsRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

const upload = createUpload();
const id = (req: Request) => req.params.listingId as string;
const BASE = "/merchant/sale-listings";

saleListingsRouter.get(
  BASE,
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await sales.listSaleListings(req.auth!.sub, ListSaleListingsQuerySchema.parse(req.query)));
  }),
);

saleListingsRouter.post(
  BASE,
  authenticate(),
  validateBody(CreateSaleListingSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await sales.createSaleListing(req.auth!.sub, req.body, ctxOf(req)));
  }),
);

saleListingsRouter.get(
  `${BASE}/:listingId`,
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await sales.getSaleListing(req.auth!.sub, id(req)));
  }),
);

saleListingsRouter.patch(
  `${BASE}/:listingId`,
  authenticate(),
  validateBody(UpdateSaleListingSchema),
  asyncHandler(async (req, res) => {
    res.status(200).json(await sales.updateSaleListing(req.auth!.sub, id(req), req.body, ctxOf(req)));
  }),
);

saleListingsRouter.delete(
  `${BASE}/:listingId`,
  authenticate(),
  asyncHandler(async (req, res) => {
    await sales.deleteSaleListing(req.auth!.sub, id(req), ctxOf(req));
    res.status(204).send();
  }),
);

saleListingsRouter.post(
  `${BASE}/:listingId/files`,
  authenticate(),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const { kind } = UploadSaleFileSchema.parse(req.body);
    if (!req.file) {
      throw new ApiError({ status: 422, type: "validation_error", code: "file_required", message: "Attach a file.", field: "file" });
    }
    assertDeclaredTypeMatchesBytes(req.file.buffer, req.file.mimetype);
    const file = { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size };
    res.status(200).json(await sales.uploadSaleFile(req.auth!.sub, id(req), { kind, file }, ctxOf(req)));
  }),
);

saleListingsRouter.get(
  `${BASE}/:listingId/files/:fileId`,
  authenticate(),
  asyncHandler(async (req, res) => {
    sendPhoto(res, await sales.readOwnSaleFile(req.auth!.sub, id(req), req.params.fileId as string));
  }),
);

saleListingsRouter.delete(
  `${BASE}/:listingId/files/:fileId`,
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await sales.deleteSaleFile(req.auth!.sub, id(req), req.params.fileId as string, ctxOf(req)));
  }),
);

saleListingsRouter.post(
  `${BASE}/:listingId/submit`,
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await sales.submitSaleListing(req.auth!.sub, id(req), ctxOf(req)));
  }),
);

saleListingsRouter.post(
  `${BASE}/:listingId/status`,
  authenticate(),
  validateBody(SetSaleStatusSchema),
  asyncHandler(async (req, res) => {
    res.status(200).json(await sales.setSaleStatus(req.auth!.sub, id(req), req.body, ctxOf(req)));
  }),
);

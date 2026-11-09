import { Router, type Request } from "express";
import { ApiError } from "@cral/types";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { assertDeclaredTypeMatchesBytes, createUpload, safeContentType, safeDisposition } from "../../lib/uploads.js";
import type { RequestContext } from "../merchant/service.js";
import * as sales from "./service.js";
import {
  CreateSaleListingSchema,
  ListInboxQuerySchema,
  ListSaleListingsQuerySchema,
  ReplyEnquirySchema,
  SetSaleStatusSchema,
  UpdateSaleListingSchema,
  UploadSaleDocumentSchema,
} from "./schemas.js";

/**
 * Seller side of car sales - openapi/sales-seller.yaml. Any signed-in
 * account: a merchant sells from the merchant portal, a private seller
 * from the customer portal. Nothing here moves money, so no
 * Idempotency-Key (spec §2 asks for one only on money and handovers).
 */
export const saleListingsRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

const upload = createUpload();

// The inbox paths are declared before `/:listingId` so "inbox" is never
// read as a listing id.
saleListingsRouter.get(
  "/me/sale-inbox",
  authenticate(),
  asyncHandler(async (req, res) => {
    const q = ListInboxQuerySchema.parse(req.query);
    const listingId = typeof req.query.listing_id === "string" ? req.query.listing_id : undefined;
    res.status(200).json(await sales.listSellerInbox(req.auth!.sub, { ...q, listing_id: listingId }));
  }),
);

saleListingsRouter.post(
  "/me/sale-inbox/:enquiryId/reply",
  authenticate(),
  validateBody(ReplyEnquirySchema),
  asyncHandler(async (req, res) => {
    res.status(200).json(await sales.replyToEnquiry(req.auth!.sub, req.params.enquiryId as string, req.body, ctxOf(req)));
  }),
);

saleListingsRouter.post(
  "/me/sale-inbox/:enquiryId/close",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await sales.closeEnquiry(req.auth!.sub, req.params.enquiryId as string, ctxOf(req)));
  }),
);

saleListingsRouter.get(
  "/me/sale-listings",
  authenticate(),
  asyncHandler(async (req, res) => {
    const q = ListSaleListingsQuerySchema.parse(req.query);
    res.status(200).json(await sales.listMySaleListings(req.auth!.sub, q));
  }),
);

saleListingsRouter.post(
  "/me/sale-listings",
  authenticate(),
  validateBody(CreateSaleListingSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await sales.createSaleListing(req.auth!.sub, req.body, ctxOf(req)));
  }),
);

saleListingsRouter.get(
  "/me/sale-listings/:listingId",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await sales.getMySaleListing(req.auth!.sub, req.params.listingId as string));
  }),
);

saleListingsRouter.patch(
  "/me/sale-listings/:listingId",
  authenticate(),
  validateBody(UpdateSaleListingSchema),
  asyncHandler(async (req, res) => {
    res
      .status(200)
      .json(await sales.updateSaleListing(req.auth!.sub, req.params.listingId as string, req.body, ctxOf(req)));
  }),
);

saleListingsRouter.delete(
  "/me/sale-listings/:listingId",
  authenticate(),
  asyncHandler(async (req, res) => {
    await sales.deleteSaleListing(req.auth!.sub, req.params.listingId as string, ctxOf(req));
    res.status(204).send();
  }),
);

saleListingsRouter.post(
  "/me/sale-listings/:listingId/documents",
  authenticate(),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const parsed = UploadSaleDocumentSchema.parse(req.body);
    if (!req.file) {
      throw new ApiError({ status: 422, type: "validation_error", code: "file_required", message: "Attach a file.", field: "file" });
    }
    assertDeclaredTypeMatchesBytes(req.file.buffer, req.file.mimetype);
    const result = await sales.uploadSaleDocument(
      req.auth!.sub,
      req.params.listingId as string,
      {
        kind: parsed.kind,
        slot: parsed.slot,
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

saleListingsRouter.get(
  "/me/sale-listings/:listingId/documents/:documentId",
  authenticate(),
  asyncHandler(async (req, res) => {
    const doc = await sales.readOwnSaleDocument(
      req.auth!.sub,
      req.params.listingId as string,
      req.params.documentId as string,
    );
    res.setHeader("Content-Type", safeContentType(doc.contentType));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Disposition", `${safeDisposition(doc.contentType)}; filename="${encodeURIComponent(doc.originalName)}"`);
    res.status(200).send(doc.body);
  }),
);

saleListingsRouter.post(
  "/me/sale-listings/:listingId/submit",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await sales.submitSaleListing(req.auth!.sub, req.params.listingId as string, ctxOf(req)));
  }),
);

saleListingsRouter.post(
  "/me/sale-listings/:listingId/renew",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await sales.renewSaleListing(req.auth!.sub, req.params.listingId as string, ctxOf(req)));
  }),
);

saleListingsRouter.post(
  "/me/sale-listings/:listingId/status",
  authenticate(),
  validateBody(SetSaleStatusSchema),
  asyncHandler(async (req, res) => {
    res
      .status(200)
      .json(await sales.setSaleStatus(req.auth!.sub, req.params.listingId as string, req.body, ctxOf(req)));
  }),
);

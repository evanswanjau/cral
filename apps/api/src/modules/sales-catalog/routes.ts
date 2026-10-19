import { Router, type Request } from "express";
import { PaginationQuerySchema } from "@cral/types";
import { authenticate } from "../../middleware/authenticate.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { validateBody } from "../../lib/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { safeContentType, safeDisposition } from "../../lib/uploads.js";
import type { RequestContext } from "../merchant/service.js";
import * as catalog from "./service.js";

/** Buying - openapi/sales-catalog.yaml. Browse is public; enquiring and reporting are signed in. */
export const salesCatalogRouter = Router();

function ctxOf(req: Request): RequestContext {
  return { ip: req.ip ?? null, requestId: req.requestId ?? null };
}

salesCatalogRouter.get(
  "/sales",
  asyncHandler(async (req, res) => {
    res.status(200).json(await catalog.browseSales(catalog.BrowseQuerySchema.parse(req.query)));
  }),
);

salesCatalogRouter.get(
  "/sales/:ref",
  asyncHandler(async (req, res) => {
    res.status(200).json(await catalog.getSale(req.params.ref as string));
  }),
);

salesCatalogRouter.get(
  "/sales/:ref/photos/:documentId",
  asyncHandler(async (req, res) => {
    const photo = await catalog.readSalePhoto(req.params.ref as string, req.params.documentId as string);
    res.setHeader("Content-Type", safeContentType(photo.contentType));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader(
      "Content-Disposition",
      `${safeDisposition(photo.contentType)}; filename="${encodeURIComponent(photo.originalName)}"`,
    );
    res.status(200).send(photo.body);
  }),
);

// Each enquiry notifies a seller (and may text them), so it is capped the
// same way a towing request is.
salesCatalogRouter.post(
  "/sales/:ref/enquiries",
  authenticate(),
  rateLimit({ bucket: "sale_enquiry", limit: 5, windowSeconds: 3600, keyFn: (req) => req.auth?.sub ?? req.ip ?? "unknown" }),
  validateBody(catalog.EnquirySchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await catalog.createEnquiry(req.auth!.sub, req.params.ref as string, req.body, ctxOf(req)));
  }),
);

salesCatalogRouter.post(
  "/sales/:ref/reports",
  authenticate(),
  rateLimit({ bucket: "sale_report", limit: 10, windowSeconds: 3600, keyFn: (req) => req.auth?.sub ?? req.ip ?? "unknown" }),
  validateBody(catalog.ReportSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await catalog.reportListing(req.auth!.sub, req.params.ref as string, req.body, ctxOf(req)));
  }),
);

salesCatalogRouter.get(
  "/me/sale-enquiries",
  authenticate(),
  asyncHandler(async (req, res) => {
    res.status(200).json(await catalog.listMyEnquiries(req.auth!.sub, PaginationQuerySchema.parse(req.query)));
  }),
);

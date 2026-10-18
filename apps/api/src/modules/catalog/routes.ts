import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { safeContentType, safeDisposition } from "../../lib/uploads.js";
import { CatalogSearchQuerySchema } from "./schemas.js";
import * as catalog from "./service.js";
import * as drivers from "./drivers.js";
import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";

export const catalogRouter = Router();

// Public and unauthenticated, so it gets its own generous per-IP bucket -
// a browsing session makes many reads. Tighter than nothing, loose enough
// not to bite a real user paging through results.
const browse = rateLimit({ bucket: "catalog", limit: 120, windowSeconds: 60 });

catalogRouter.get(
  "/catalog/vehicles",
  browse,
  asyncHandler(async (req, res) => {
    const query = CatalogSearchQuerySchema.parse(req.query);
    res.status(200).json(await catalog.listCatalog(query));
  }),
);

catalogRouter.get(
  "/catalog/collections",
  browse,
  asyncHandler(async (_req, res) => {
    res.status(200).json(await catalog.getCollections());
  }),
);

catalogRouter.get(
  "/catalog/counties",
  browse,
  asyncHandler(async (_req, res) => {
    res.status(200).json(await catalog.getCounties());
  }),
);

catalogRouter.get(
  "/catalog/vehicles/:id",
  browse,
  asyncHandler(async (req, res) => {
    res.status(200).json(await catalog.getCatalogVehicle(req.params.id as string));
  }),
);

catalogRouter.get(
  "/catalog/vehicles/:id/photos/:photoId",
  browse,
  asyncHandler(async (req, res) => {
    const photo = await catalog.readCatalogPhoto(
      req.params.id as string,
      req.params.photoId as string,
    );
    // Same hardening as the merchant document route: the stored type is
    // only ever echoed back through the allowlist, and nosniff stops the
    // browser second-guessing it. Anything outside the image allowlist
    // (rows predating it) comes back as a download.
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

// Drivers for hire (docs/plans/drivers.md) - same public bucket as cars.
const DriverSearchQuerySchema = PaginationQuerySchema.extend({ county: z.string().min(1).optional() });

catalogRouter.get(
  "/catalog/drivers",
  browse,
  asyncHandler(async (req, res) => {
    const q = DriverSearchQuerySchema.parse(req.query);
    res.status(200).json(await drivers.listPublicDrivers({ county: q.county, cursor: q.cursor, limit: q.limit }));
  }),
);

catalogRouter.get(
  "/catalog/drivers/:id",
  browse,
  asyncHandler(async (req, res) => {
    res.status(200).json(await drivers.getPublicDriver(req.params.id as string));
  }),
);

// The drivers a renter can add to this car - its own merchant's live drivers.
catalogRouter.get(
  "/catalog/vehicles/:id/drivers",
  browse,
  asyncHandler(async (req, res) => {
    const vehicle = (await catalog.baseCatalogQuery().where("v.id", req.params.id as string).first("v.merchant_id")) as
      | { merchant_id: string }
      | undefined;
    res.status(200).json({ data: vehicle ? await drivers.driversForMerchant(vehicle.merchant_id) : [] });
  }),
);

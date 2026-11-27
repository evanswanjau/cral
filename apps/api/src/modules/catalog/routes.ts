import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { safeContentType, safeDisposition } from "../../lib/uploads.js";
import { CatalogSearchQuerySchema, CountiesQuerySchema } from "./schemas.js";
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
  asyncHandler(async (req, res) => {
    const { group } = CountiesQuerySchema.parse(req.query);
    res.status(200).json(await catalog.getCounties(group));
  }),
);

// The Hire doors on the home page (PR H1): count + from-price per group.
catalogRouter.get(
  "/catalog/hire-summary",
  browse,
  asyncHandler(async (_req, res) => {
    res.status(200).json(await catalog.getHireSummary());
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
// DR1 (docs/plans/drivers-that-work.md): searched by county, rate and a
// window; a price sort orders on the chosen rate, so it needs one.
const DriverSearchQuerySchema = PaginationQuerySchema.extend({
  county: z.string().trim().min(1).max(60).optional().catch(undefined),
  unit: z.enum(["day", "hour", "trip"]).optional(),
  pickup_at: z.coerce.date().optional(),
  dropoff_at: z.coerce.date().optional(),
  sort: z.enum(["recommended", "price_asc", "price_desc"]).optional(),
}).superRefine((q, ctx) => {
  if (!!q.pickup_at !== !!q.dropoff_at) {
    ctx.addIssue({ code: "custom", message: "pickup_at and dropoff_at must be given together", path: [q.pickup_at ? "dropoff_at" : "pickup_at"] });
  }
  if (q.pickup_at && q.dropoff_at && q.dropoff_at <= q.pickup_at) {
    ctx.addIssue({ code: "custom", message: "dropoff_at must be after pickup_at", path: ["dropoff_at"] });
  }
  if ((q.sort === "price_asc" || q.sort === "price_desc") && !q.unit) {
    ctx.addIssue({ code: "custom", message: "Pick a rate (day, hour or trip) to sort by price", path: ["unit"] });
  }
});

catalogRouter.get(
  "/catalog/drivers",
  browse,
  asyncHandler(async (req, res) => {
    const q = DriverSearchQuerySchema.parse(req.query);
    res.status(200).json(await drivers.listPublicDrivers(q));
  }),
);

// Before `/catalog/drivers/:id`, so "counties" is never read as a driver id.
catalogRouter.get(
  "/catalog/drivers/counties",
  browse,
  asyncHandler(async (_req, res) => {
    res.status(200).json(await drivers.driverCounties());
  }),
);

catalogRouter.get(
  "/catalog/drivers/:id",
  browse,
  asyncHandler(async (req, res) => {
    res.status(200).json(await drivers.getPublicDriver(req.params.id as string));
  }),
);

// The driver's photo (DR2), served like a listing photo.
catalogRouter.get(
  "/catalog/drivers/:id/photo/:photoId",
  browse,
  asyncHandler(async (req, res) => {
    const photo = await drivers.readPublicDriverPhoto(req.params.id as string, req.params.photoId as string);
    res.setHeader("Content-Type", safeContentType(photo.contentType));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Disposition", `${safeDisposition(photo.contentType)}; filename="driver-photo"`);
    res.status(200).send(photo.body);
  }),
);

// The drivers a renter can add to this car - its own merchant's live drivers.
catalogRouter.get(
  "/catalog/vehicles/:id/drivers",
  browse,
  asyncHandler(async (req, res) => {
    // Owner's drivers first, else other owners' (docs/plans/drivers.md). A
    // car that already comes with a driver offers none.
    const vehicle = (await catalog
      .baseCatalogQuery()
      .where("v.id", req.params.id as string)
      .first("v.merchant_id", "v.county", "v.chauffeured")) as
      | { merchant_id: string; county: string | null; chauffeured: boolean }
      | undefined;
    if (!vehicle || vehicle.chauffeured) {
      res.status(200).json({ source: "owner", data: [] });
      return;
    }
    res.status(200).json(await drivers.driversForCar(vehicle));
  }),
);

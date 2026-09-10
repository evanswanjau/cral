import { z } from "zod";
import { VEHICLE_CATEGORIES } from "../vehicles/categories.js";

/**
 * Query schema for `GET /catalog/vehicles`. Every filter is optional; a
 * blank string from the querystring is treated as absent. `from`/`to` are
 * validated as a pair here so the service never has to guard a half-window.
 */
export const CatalogSearchQuerySchema = z
  .object({
    county: z.string().trim().min(1).max(60).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD").optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD").optional(),
    category: z.enum(VEHICLE_CATEGORIES).optional(),
    max_price: z.coerce.number().int().min(0).optional(),
    seats_min: z.coerce.number().int().min(1).max(40).optional(),
    transmission: z.enum(["automatic", "manual"]).optional(),
    chauffeured: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    sort: z.enum(["recommended", "price_asc", "price_desc", "newest"]).default("recommended"),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(48).default(24),
  })
  .transform((q) => {
    // Normalise "" -> undefined for the string filters (a cleared input in
    // the browse UI sends an empty param).
    const county = q.county && q.county.length > 0 ? q.county : undefined;
    return { ...q, county };
  })
  .superRefine((q, ctx) => {
    if ((q.from && !q.to) || (q.to && !q.from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from and to must be given together",
        path: [q.from ? "to" : "from"],
      });
    }
    if (q.from && q.to && q.to < q.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "to must not be before from",
        path: ["to"],
      });
    }
  });

export type CatalogSearchQuery = z.infer<typeof CatalogSearchQuerySchema>;

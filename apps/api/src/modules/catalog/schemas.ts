import { z } from "zod";
import { HIRE_GROUP_KEYS, MACHINE_TYPES, TRUCK_TYPES, VEHICLE_CATEGORIES } from "../vehicles/categories.js";

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
    // "All cars" is sedan + suv + van (PR H1); `category` narrows inside it.
    group: z.enum(HIRE_GROUP_KEYS).optional(),
    category: z.enum(VEHICLE_CATEGORIES).optional(),
    max_price: z.coerce.number().int().min(0).optional(),
    seats_min: z.coerce.number().int().min(1).max(40).optional(),
    transmission: z.enum(["automatic", "manual"]).optional(),
    // Truck filters (20261110090000). Either one narrows to trucks, since
    // no other category carries a truck type or a payload.
    truck_type: z.enum(TRUCK_TYPES).optional(),
    payload_min_kg: z.coerce.number().int().min(1).max(100_000).optional(),
    // Machinery filter (20261126090000) - narrows to machines the same way.
    machine_type: z.enum(MACHINE_TYPES).optional(),
    // PR H3: "fixed" = an instant total, "quote" = the owner prices it.
    priced: z.enum(["fixed", "quote"]).optional(),
    chauffeured: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    sort: z
      .enum(["recommended", "price_asc", "price_desc", "newest", "rating_desc"])
      .default("recommended"),
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

/** `GET /catalog/counties?group=` - optional, one of the hire groups. */
export const CountiesQuerySchema = z.object({
  group: z.enum(HIRE_GROUP_KEYS).optional(),
});

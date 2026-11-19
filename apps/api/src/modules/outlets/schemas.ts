import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";
import { KENYA_COUNTIES } from "../../lib/counties.js";

/** Merchant outlets ("Your premises") - see openapi/merchant-outlets.yaml. */

export const OUTLET_KINDS = ["garage", "parts"] as const;
export type OutletKind = (typeof OUTLET_KINDS)[number];

export const SERVICE_TYPES = ["service", "diagnostics", "mechanical", "bodywork", "tyres", "electrical", "ac"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export type OutletStatus = "draft" | "pending" | "review" | "action" | "rejected" | "live" | "paused";

/** Fewest photos an outlet can be sent with, and most it can carry. */
export const MIN_OUTLET_PHOTOS = 2;
export const MAX_OUTLET_PHOTOS = 8;

export const ListOutletsQuerySchema = PaginationQuerySchema;
export type ListOutletsQuery = z.infer<typeof ListOutletsQuerySchema>;

const phone = z
  .string()
  .trim()
  .regex(/^[0-9 +()-]{9,20}$/, "Enter a phone number, like 0712 345 678.")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

const fields = {
  name: z.string().trim().min(2, "Enter the name customers see on site.").max(120),
  address: z.string().trim().min(5, "Enter the street, building and how to find it.").max(500),
  county: z.enum(KENYA_COUNTIES, { errorMap: () => ({ message: "Pick the county." }) }),
  phone,
  opening_hours: z.string().trim().min(3, "Enter your opening hours.").max(200),
  service_types: z.array(z.enum(SERVICE_TYPES)).max(SERVICE_TYPES.length).optional(),
};

/** `kind` is garage only until PT1 opens parts outlets. */
export const CreateOutletSchema = z.object({ kind: z.literal("garage"), ...fields });
export type CreateOutletInput = z.infer<typeof CreateOutletSchema>;

export const UpdateOutletSchema = z.object(fields).partial();
export type UpdateOutletInput = z.infer<typeof UpdateOutletSchema>;

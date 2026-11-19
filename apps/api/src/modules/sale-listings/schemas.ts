import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";
import { KENYA_COUNTIES } from "../../lib/counties.js";

/** Merchant sale listings ("Cars for sale") - see openapi/merchant-sales.yaml. */

export const BODY_TYPES = ["sedan", "suv", "van", "pickup", "hatchback", "wagon", "truck", "other"] as const;
export const TRANSMISSIONS = ["automatic", "manual"] as const;
export const FUELS = ["petrol", "diesel", "hybrid", "electric"] as const;
export const IMPORT_STATUSES = ["locally_used", "foreign_used", "new"] as const;
export const ACCIDENT_HISTORY = ["none", "minor", "major"] as const;

export const SALE_STATUSES = ["draft", "pending", "review", "action", "rejected", "live", "paused", "sold", "withdrawn"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const SALE_FILE_KINDS = ["photo", "logbook"] as const;
export type SaleFileKind = (typeof SALE_FILE_KINDS)[number];

/** Fewest photos a listing can be sent with, and most it can carry. */
export const MIN_SALE_PHOTOS = 4;
export const MAX_SALE_PHOTOS = 12;

/** KES 1,000 to KES 500M, in cents. */
const MIN_PRICE = 1_000 * 100;
const MAX_PRICE = 500_000_000 * 100;

const thisYear = new Date().getUTCFullYear();

const money = z.object({
  amount: z
    .number()
    .int("Enter a whole number of shillings.")
    .min(MIN_PRICE, "Enter the asking price.")
    .max(MAX_PRICE, "That price looks wrong. Check the number of zeros."),
  currency: z.literal("KES"),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));

/** Fields Ops checks against the logbook and photos: locked once live. */
const reviewed = {
  body_type: z.enum(BODY_TYPES),
  make: z.string().trim().min(1, "Enter the make.").max(60),
  model: z.string().trim().min(1, "Enter the model.").max(60),
  year: z.number().int().min(1950, "Enter the year of manufacture.").max(thisYear + 1, "Enter the year of manufacture."),
  registration: z.string().trim().min(4, "Enter the registration plate.").max(20),
  mileage_km: z.number().int().min(0).max(3_000_000),
  transmission: z.enum(TRANSMISSIONS),
  fuel: z.enum(FUELS),
  engine_cc: z.number().int().min(50).max(20_000).nullable().optional(),
  colour: optionalText(40),
  import_status: z.enum(IMPORT_STATUSES),
  accident_history: z.enum(ACCIDENT_HISTORY),
  known_faults: z.string().trim().min(2, 'Describe any known faults, or write "None known".').max(2000),
  encumbered: z.boolean(),
  county: z.enum(KENYA_COUNTIES, { errorMap: () => ({ message: "Pick the county the car is in." }) }),
};

/** Fields the merchant can change while the listing is live or paused. */
const open = {
  asking_price: money,
  negotiable: z.boolean().optional(),
  viewing_area: z.string().trim().min(2, "Say roughly where a buyer can view it.").max(120),
  description: optionalText(4000),
};

export const REVIEWED_FIELDS = Object.keys(reviewed) as (keyof typeof reviewed)[];

export const CreateSaleListingSchema = z.object({ ...reviewed, ...open });
export type CreateSaleListingInput = z.infer<typeof CreateSaleListingSchema>;

export const UpdateSaleListingSchema = z.object({ ...reviewed, ...open }).partial();
export type UpdateSaleListingInput = z.infer<typeof UpdateSaleListingSchema>;

export const ListSaleListingsQuerySchema = PaginationQuerySchema;
export type ListSaleListingsQuery = z.infer<typeof ListSaleListingsQuerySchema>;

export const UploadSaleFileSchema = z.object({ kind: z.enum(SALE_FILE_KINDS) });

export const SetSaleStatusSchema = z.object({ to: z.enum(["paused", "live", "sold", "withdrawn"]) });
export type SetSaleStatusInput = z.infer<typeof SetSaleStatusSchema>;

/** Report this listing (CS2, openapi/customer-sales.yaml). */
export const REPORT_REASONS = ["scam", "not_this_car", "wrong_details", "already_sold", "offensive", "other"] as const;
export const ReportSaleListingSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(1000).nullable().optional(),
});
export type ReportSaleListingInput = z.infer<typeof ReportSaleListingSchema>;

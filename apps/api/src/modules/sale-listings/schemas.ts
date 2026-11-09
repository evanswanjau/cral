import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";
import { VEHICLE_CATEGORIES } from "../vehicles/categories.js";

/**
 * Seller side of car sales - openapi/sales-seller.yaml. Used by both the
 * merchant portal and the customer portal (private sellers): a sale
 * listing belongs to a `users` row, so one API serves both.
 *
 * The asking price is whole shillings as a string, the same as every rate
 * field in the vehicle forms.
 */

export const IMPORT_STATUSES = ["locally_used", "foreign_used", "new"] as const;
export const ACCIDENT_HISTORY = ["none", "minor", "major"] as const;
export const SERVICE_HISTORY = ["full", "partial", "none"] as const;
export const DRIVES = ["2wd", "4wd", "awd"] as const;
export const TRANSMISSIONS = ["Automatic", "Manual"] as const;
export const FUELS = ["Petrol", "Diesel", "Hybrid", "Electric"] as const;

/** The eight photographs the canvas promises ("the eight photographs we specify"). */
export const PHOTO_SLOTS = [
  "front",
  "rear",
  "left",
  "right",
  "interior_front",
  "interior_rear",
  "dashboard",
  "engine_bay",
] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

export const SALE_DOCUMENT_KINDS = ["logbook", "bank_clearance_letter", "ntsa_search", "sale_photo"] as const;
export type SaleDocumentKind = (typeof SALE_DOCUMENT_KINDS)[number];

const shillings = z.string().trim().regex(/^\d+$/, "Enter a whole number of shillings.");
const thisYear = new Date().getUTCFullYear();

const ListingFields = {
  category: z.enum(VEHICLE_CATEGORIES),
  make: z.string().trim().min(1, "Enter the make.").max(60),
  model: z.string().trim().min(1, "Enter the model.").max(60),
  year: z.coerce.number().int().min(1950, "Enter the year of manufacture.").max(thisYear + 1),
  registration: z.string().trim().min(4, "Enter the registration plate.").max(20),
  chassis_number: z.string().trim().min(6, "Enter the chassis number from the logbook.").max(40),
  mileage_km: z.coerce.number().int().min(0).max(2_000_000),
  engine_cc: z.coerce.number().int().min(50).max(20_000).nullable().optional(),
  transmission: z.enum(TRANSMISSIONS),
  fuel: z.enum(FUELS),
  colour: z.string().trim().max(40).nullable().optional(),
  drive: z.enum(DRIVES).nullable().optional(),
  import_status: z.enum(IMPORT_STATUSES),
  asking_price: shillings,
  negotiable: z.boolean().optional(),
  known_faults: z
    .string()
    .trim()
    .min(4, "Describe any known faults, or write \"None known\".")
    .max(2000),
  accident_history: z.enum(ACCIDENT_HISTORY),
  accident_note: z.string().trim().max(1000).nullable().optional(),
  encumbered: z.boolean(),
  service_history: z.enum(SERVICE_HISTORY),
  county: z.string().trim().min(1, "Pick the county the car is in.").max(60),
  viewing_area: z.string().trim().min(2, "Say roughly where a buyer can view it.").max(120),
  description: z.string().trim().max(4000).nullable().optional(),
  auto_share_contact: z.boolean().optional(),
};

export const CreateSaleListingSchema = z.object({
  ...ListingFields,
  /** A fleet car being sold - merchants only. */
  vehicle_id: z.string().optional(),
});
export type CreateSaleListingInput = z.infer<typeof CreateSaleListingSchema>;

export const UpdateSaleListingSchema = z.object(ListingFields).partial();
export type UpdateSaleListingInput = z.infer<typeof UpdateSaleListingSchema>;

/** Fields a reviewer has read. Changing one on a live listing sends it back to review. */
export const REVIEWED_FIELDS = [
  "category",
  "make",
  "model",
  "year",
  "registration",
  "chassis_number",
  "mileage_km",
  "engine_cc",
  "transmission",
  "fuel",
  "colour",
  "drive",
  "import_status",
  "known_faults",
  "accident_history",
  "accident_note",
  "encumbered",
  "service_history",
] as const;

export const ListSaleListingsQuerySchema = PaginationQuerySchema;

export const UploadSaleDocumentSchema = z.object({
  kind: z.enum(SALE_DOCUMENT_KINDS),
  slot: z.enum(PHOTO_SLOTS).optional(),
});

export const SALE_STATUS_ACTIONS = ["paused", "live", "under_offer", "sold", "withdrawn"] as const;
export const SetSaleStatusSchema = z.object({
  to: z.enum(SALE_STATUS_ACTIONS),
  /** Asked when marking sold - for metrics only. */
  sold_via_cral: z.boolean().optional(),
});
export type SetSaleStatusInput = z.infer<typeof SetSaleStatusSchema>;

export const ReplyEnquirySchema = z.object({
  message: z.string().trim().max(2000).optional(),
  share_phone: z.boolean(),
});
export type ReplyEnquiryInput = z.infer<typeof ReplyEnquirySchema>;

export const ListInboxQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["open", "all"]).default("open"),
});

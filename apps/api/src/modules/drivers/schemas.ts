import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";

/**
 * Merchant drivers - see openapi/merchant-drivers.yaml. Rates are whole
 * shillings as strings, the same as the vehicle forms; an empty string
 * clears a rate.
 */

const rate = z.string().trim().regex(/^\d*$/, "Enter a whole number of shillings.").optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const DRIVER_DOCUMENT_KINDS = ["driving_licence", "national_id", "kra_pin"] as const;
export type DriverDocumentKind = (typeof DRIVER_DOCUMENT_KINDS)[number];

export const ListDriversQuerySchema = PaginationQuerySchema;
export type ListDriversQuery = z.infer<typeof ListDriversQuerySchema>;

export const CreateDriverSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the driver's full name."),
  phone: z.string().trim().min(1, "Enter the driver's phone number."),
  national_id: z.string().trim().min(4, "Enter the national ID number."),
  kra_pin: z.string().trim().min(4, "Enter the KRA PIN."),
  licence_number: z.string().trim().min(3, "Enter the licence number."),
  licence_expiry: isoDate,
  county: z.string().trim().min(1, "Pick the county they work in."),
  is_account_holder: z.boolean().optional(),
  daily_rate: rate,
  hourly_rate: rate,
  trip_rate: rate,
});
export type CreateDriverInput = z.infer<typeof CreateDriverSchema>;

export const UpdateDriverSchema = CreateDriverSchema.omit({ is_account_holder: true }).partial();
export type UpdateDriverInput = z.infer<typeof UpdateDriverSchema>;

export const UploadDriverDocumentSchema = z.object({
  kind: z.enum(DRIVER_DOCUMENT_KINDS),
  expires_at: isoDate.optional(),
});

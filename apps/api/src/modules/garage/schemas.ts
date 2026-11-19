import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";
import { KENYA_COUNTIES } from "../../lib/counties.js";
import { SERVICE_TYPES } from "../outlets/schemas.js";

/** Phase 4 GS2 - openapi/customer-garage.yaml, openapi/merchant-garage.yaml. */

const thisYear = new Date().getUTCFullYear();

export const CarSchema = z.object({
  make: z.string().trim().min(2, "Enter the make, like Toyota.").max(60),
  model: z.string().trim().min(1, "Enter the model, like Fielder.").max(60),
  year: z.coerce.number().int().min(1960, "Enter the year it was made.").max(thisYear + 1, "Enter the year it was made."),
  plate: z
    .string()
    .trim()
    .min(4, "Enter the number plate.")
    .max(20)
    .regex(/^[A-Za-z0-9 -]+$/, "Letters and numbers only."),
  chassis_number: z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Za-z0-9]*$/, "Letters and numbers only, as on the logbook.")
    .nullable()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
});
export type CarInput = z.infer<typeof CarSchema>;

export const CreateRequestSchema = z.object({
  car_id: z.string().min(1),
  service_type: z.enum(SERVICE_TYPES),
  description: z.string().trim().min(10, "Say a little more about what the car needs.").max(2000),
  county: z.enum(KENYA_COUNTIES, { errorMap: () => ({ message: "Pick the county." }) }),
});
export type CreateRequestInput = z.infer<typeof CreateRequestSchema>;

export const LINE_KINDS = ["part", "labour", "delivery", "other"] as const;

export const QuoteLineSchema = z.object({
  kind: z.enum(LINE_KINDS),
  description: z.string().trim().min(2, "Describe the line.").max(200),
  amount: z.number().int("Whole cents only.").min(1, "Each line needs an amount."),
});

export const QuoteSchema = z.object({
  lines: z.array(QuoteLineSchema).min(1, "Add at least one line.").max(30),
  days_needed: z.number().int().min(1).max(60),
  note: z.string().trim().max(1000).nullable().optional(),
});
export type QuoteInput = z.infer<typeof QuoteSchema>;

export const PreviewSchema = z.object({ lines: z.array(QuoteLineSchema).max(30) });

export const ListQuerySchema = PaginationQuerySchema;
export const MerchantListQuerySchema = PaginationQuerySchema.extend({
  filter: z.enum(["to_quote", "quoted", "closed", "all"]).default("to_quote"),
});

/** A quote stands this long after it was last sent, the truck-quote window. */
export const QUOTE_VALID_MS = 48 * 3600_000;
/** At most this many garages are asked per request. */
export const MAX_GARAGES = 5;

// --- GS3: orders ------------------------------------------------------

/** A second quote for extra work: the same itemised shape. */
export const ExtraQuoteSchema = QuoteSchema;
export type ExtraQuoteInput = z.infer<typeof ExtraQuoteSchema>;

export const PayOrderSchema = z.object({ phone: z.string().trim().min(9, "Enter the M-Pesa number.").max(20) });

export const ProblemSchema = z.object({
  note: z.string().trim().min(10, "Say what's wrong, so CRAL can help.").max(2000),
});

export const ResolveSchema = z.object({
  outcome: z.enum(["release", "refund"]),
  note: z.string().trim().min(5, "Say how it was settled.").max(2000),
});

export const MerchantOrderQuerySchema = PaginationQuerySchema.extend({
  filter: z.enum(["active", "done", "all"]).default("active"),
});

export const ORDER_STATUSES = [
  "awaiting_payment",
  "paid",
  "in_progress",
  "ready",
  "completed",
  "problem",
  "cancelled",
  "refunded",
] as const;
export const AdminOrderQuerySchema = PaginationQuerySchema.extend({ status: z.enum(ORDER_STATUSES).optional() });

/** A ready job confirms itself this long after "ready" (owner decision 7). */
export const AUTO_CONFIRM_MS = 72 * 3600_000;

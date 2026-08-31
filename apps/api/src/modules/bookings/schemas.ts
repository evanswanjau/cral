import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";

export const BOOKING_FILTERS = ["all", "requests", "upcoming", "on_hire", "completed", "cancelled"] as const;
export type BookingFilter = (typeof BOOKING_FILTERS)[number];

export const ListBookingsQuerySchema = PaginationQuerySchema.extend({
  filter: z.enum(BOOKING_FILTERS).default("all"),
});
export type ListBookingsQuery = z.infer<typeof ListBookingsQuerySchema>;

export const DECLINE_REASON_CODES = ["not_free", "rate_out_of_date", "hirer_needs_checking", "other"] as const;
export const DeclineBookingSchema = z.object({
  reason_code: z.enum(DECLINE_REASON_CODES),
  note: z.string().trim().optional(),
});
export type DeclineBookingInput = z.infer<typeof DeclineBookingSchema>;

export const CancelBookingSchema = z.object({
  reason: z.string().trim().min(1, "Say why you're cancelling."),
});
export type CancelBookingInput = z.infer<typeof CancelBookingSchema>;

export const HANDOVER_KINDS = ["pickup", "return"] as const;
export const CreateHandoverSchema = z.object({
  kind: z.enum(HANDOVER_KINDS),
});
export type CreateHandoverInput = z.infer<typeof CreateHandoverSchema>;

export const VerifyHandoverOtpSchema = z.object({
  code: z.string().trim().min(1),
});
export type VerifyHandoverOtpInput = z.infer<typeof VerifyHandoverOtpSchema>;

export const FUEL_LEVELS = ["empty", "quarter", "half", "three_quarter", "full"] as const;
export const HandoverConditionSchema = z.object({
  odometer_km: z.number().int().min(0).optional(),
  fuel_level: z.enum(FUEL_LEVELS).optional(),
  photo_document_ids: z.array(z.string()).optional(),
  notes: z.string().trim().optional(),
});
export type HandoverConditionInput = z.infer<typeof HandoverConditionSchema>;

export const BOOKING_REPORT_KINDS = ["claim", "conduct"] as const;
export const BOOKING_REPORT_CATEGORIES = [
  "damage",
  "fuel_short",
  "late_return",
  "missing_equipment",
  "cleaning",
  "conduct",
  "other",
] as const;

export const CreateBookingReportSchema = z
  .object({
    kind: z.enum(BOOKING_REPORT_KINDS),
    category: z.enum(BOOKING_REPORT_CATEGORIES),
    description: z.string().trim().min(1),
    amount: z.number().int().positive().optional(), // integer cents, matches every other money input at this API boundary
    evidence_document_ids: z.array(z.string()).optional(),
  })
  .refine((v) => v.kind !== "claim" || v.amount !== undefined, {
    message: "A claim needs an amount.",
    path: ["amount"],
  });
export type CreateBookingReportInput = z.infer<typeof CreateBookingReportSchema>;

export const RateHirerSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().optional(),
});
export type RateHirerInput = z.infer<typeof RateHirerSchema>;

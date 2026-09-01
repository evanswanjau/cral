import { z } from "zod";
import { PaginationQuerySchema } from "@cral/types";

export const ListPayoutsQuerySchema = PaginationQuerySchema;
export type ListPayoutsQuery = z.infer<typeof ListPayoutsQuerySchema>;

/**
 * A Nairobi calendar month. Kept as a string rather than a Date because the
 * month boundary is a *local* one — parsing to a Date here would drop the
 * timezone the caller meant, and spec §2 only allows Nairobi time for
 * display and day-boundary logic, which this is.
 */
export const StatementQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Give the month as YYYY-MM, e.g. 2026-08."),
});
export type StatementQuery = z.infer<typeof StatementQuerySchema>;

export const CreatePayoutQuerySchema = z.object({
  message: z.string().trim().min(1, "Tell us what looks wrong.").max(2000),
});
export type CreatePayoutQueryInput = z.infer<typeof CreatePayoutQuerySchema>;

import { z } from "zod";

export const QueueQuerySchema = z.object({
  status: z
    .enum(["requested", "quoted", "accepted", "declined", "completed", "cancelled", "all"])
    .optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type QueueQuery = z.infer<typeof QueueQuerySchema>;

/**
 * `amount_cents` is omitted (not just `null`) for "subject to discussion" -
 * distinguishing "no figure given" from "explicitly zero" the same way
 * every other money field in this codebase treats an absent value.
 */
export const QuoteServiceRequestSchema = z.object({
  distance_km: z.number().nonnegative().max(9999).optional().nullable(),
  amount_cents: z.number().int().nonnegative().optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export type QuoteServiceRequestInput = z.infer<typeof QuoteServiceRequestSchema>;

export const DeclineServiceRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export type DeclineServiceRequestInput = z.infer<typeof DeclineServiceRequestSchema>;

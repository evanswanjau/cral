import { z } from "zod";

export const QueueQuerySchema = z.object({
  bucket: z
    .enum(["needs_review", "with_you", "changes_sent", "approved", "rejected", "all"])
    .optional(),
  mine: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const DocumentDecisionSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  // Required when decision is "reject"; the service enforces that.
  note: z.string().trim().min(1).max(2000).optional(),
});

export const ListingDecisionSchema = z.object({
  action: z.enum(["approve", "request_changes", "reject"]),
  note: z.string().trim().min(1).max(2000).optional(),
});

export const ChecklistItemSchema = z.object({
  item_id: z.string().min(1).max(40),
  result: z.enum(["pending", "pass", "flag"]),
  note: z.string().trim().max(2000).optional(),
});

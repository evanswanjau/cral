import { z } from "zod";

/**
 * `open` (the default) is what Finance has to act on: runs waiting to be
 * paid and runs whose payment failed.
 */
export const RunListQuerySchema = z.object({
  status: z.enum(["open", "scheduled", "processing", "paid", "failed", "all"]).default("open"),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type RunListQuery = z.infer<typeof RunListQuerySchema>;

export const CutRunSchema = z.object({
  merchant_id: z.string().min(1),
});
export type CutRunInput = z.infer<typeof CutRunSchema>;

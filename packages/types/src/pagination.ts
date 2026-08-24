import { z } from "zod";

/** Cursor-based pagination per spec §2. No offset paging anywhere. */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export interface PaginatedResult<T> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
}

import { z } from "zod";

export const CreateServiceRequestSchema = z.object({
  reason: z.enum(["mechanical_breakdown", "accident"]),
  pickup_location: z.string().trim().min(1).max(300),
  destination_location: z.string().trim().min(1).max(300).optional().nullable(),
  contact_phone: z.string().trim().min(7).max(20),
  description: z.string().trim().max(1000).optional().nullable(),
});

export type CreateServiceRequestInput = z.infer<typeof CreateServiceRequestSchema>;

export const CancelServiceRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type CancelServiceRequestInput = z.infer<typeof CancelServiceRequestSchema>;

export const ListMyServiceRequestsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListMyServiceRequestsQuery = z.infer<typeof ListMyServiceRequestsQuerySchema>;

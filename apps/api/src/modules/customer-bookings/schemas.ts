import { z } from "zod";

export const CreateBookingSchema = z.object({
  vehicle_id: z.string().min(1),
  pickup_at: z.string().datetime({ offset: true }),
  dropoff_at: z.string().datetime({ offset: true }),
  note_from_hirer: z.string().max(1000).optional().nullable(),
});

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

export const ListMyBookingsQuerySchema = z.object({
  filter: z.enum(["all", "upcoming", "on_hire", "completed", "cancelled"]).default("all"),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListMyBookingsQuery = z.infer<typeof ListMyBookingsQuerySchema>;

export const CancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CancelBookingInput = z.infer<typeof CancelBookingSchema>;
